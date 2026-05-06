import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiExtractionField, FieldSource } from "@/types";

/**
 * B-070 — Records where each KYC field value came from. The marker UI in
 * the admin KYC view reads this table to decide which fields show a
 * sparkle / pencil icon next to them.
 */

interface RecordOneArgs {
  supabase: SupabaseClient;
  tenantId: string;
  clientProfileId: string;
  fieldKey: string;
  value: string | null;
  source: FieldSource;
  sourceDocumentId?: string | null;
  aiConfidence?: number | null;
}

/**
 * Insert a single field_extractions row, superseding any prior current row
 * for the same (client_profile_id, field_key). Best-effort: failures are
 * swallowed so callers' primary flow (AI verification, KYC save) is never
 * blocked by a provenance write.
 */
export async function recordFieldProvenance(args: RecordOneArgs): Promise<void> {
  const {
    supabase,
    tenantId,
    clientProfileId,
    fieldKey,
    value,
    source,
    sourceDocumentId,
    aiConfidence,
  } = args;
  try {
    // Mark prior current row(s) as superseded.
    await supabase
      .from("field_extractions")
      .update({ superseded_at: new Date().toISOString() })
      .eq("client_profile_id", clientProfileId)
      .eq("field_key", fieldKey)
      .is("superseded_at", null);

    // Insert the new row.
    await supabase.from("field_extractions").insert({
      tenant_id: tenantId,
      client_profile_id: clientProfileId,
      field_key: fieldKey,
      extracted_value: value,
      source_document_id: sourceDocumentId ?? null,
      source,
      ai_confidence: aiConfidence ?? null,
    });
  } catch {
    // Best-effort — never block the primary write.
  }
}

interface RecordAiExtractionArgs {
  supabase: SupabaseClient;
  tenantId: string;
  clientProfileId: string;
  sourceDocumentId: string;
  /** Raw extracted_fields from the AI verification result. */
  extractedFields: Record<string, unknown> | null | undefined;
  /** ai_extraction_fields from the document type config. */
  aiExtractionFields: AiExtractionField[];
}

function asTrimmedString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  return v.length === 0 ? null : v;
}

/**
 * Walk the document type's `ai_extraction_fields`, look up each one's
 * extracted value, and record a provenance row keyed by the target
 * `prefill_field` column. Skips fields without a `prefill_field` mapping
 * and skips empty values.
 */
export async function recordAiExtractionProvenance(args: RecordAiExtractionArgs): Promise<void> {
  const {
    supabase,
    tenantId,
    clientProfileId,
    sourceDocumentId,
    extractedFields,
    aiExtractionFields,
  } = args;
  if (!clientProfileId || !sourceDocumentId) return;
  if (!extractedFields || typeof extractedFields !== "object") return;
  if (!Array.isArray(aiExtractionFields) || aiExtractionFields.length === 0) return;

  for (const f of aiExtractionFields) {
    const target = f?.prefill_field;
    if (!target) continue;
    const value = asTrimmedString((extractedFields as Record<string, unknown>)[f.key]);
    if (value === null) continue;
    await recordFieldProvenance({
      supabase,
      tenantId,
      clientProfileId,
      fieldKey: target,
      value,
      source: "ai_extraction",
      sourceDocumentId,
    });
  }
}
