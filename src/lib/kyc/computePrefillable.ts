import { KYC_PREFILLABLE_FIELDS } from "@/lib/constants/prefillFields";
import type { AiExtractionField } from "@/types";

export interface PrefillableField {
  /** Target form field key (e.g. "passport_number"). Always in `KYC_PREFILLABLE_FIELDS`. */
  target: string;
  /** Extracted value to apply. Already non-empty after trim. */
  value: string;
  /** Document id the value was extracted from (for telemetry / debugging). */
  sourceDocId: string;
  /** Human-readable doc type name (for telemetry / toast copy). */
  sourceDocLabel: string;
}

interface DocLike {
  id: string;
  document_type_id: string | null;
  uploaded_at?: string | null;
  verification_result: { extracted_fields?: Record<string, unknown> | null } | null;
}

interface DocTypeLike {
  id: string;
  name: string;
  ai_extraction_fields?: AiExtractionField[] | null;
}

const PREFILLABLE_SET = new Set<string>(KYC_PREFILLABLE_FIELDS);

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function toIsoTimestamp(raw: string | null | undefined): number {
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * B-042 — single source of truth for "is there extracted data ready to drop
 * into the KYC form?" Consumed by both the Identity step "Fill from uploaded
 * document" button and the ✨ indicator on the wizard step nav.
 *
 * - For each doc, look up its document type's `ai_extraction_fields`.
 * - Keep only fields whose `prefill_field` is a whitelisted KYC column.
 * - Drop rows whose extracted value is empty.
 * - Drop rows whose target form field already has a non-empty value.
 * - If two docs extract the same target, the earliest-uploaded non-empty
 *   value wins (stable order; ties broken by doc id).
 */
export function computePrefillableFields(args: {
  form: Record<string, unknown>;
  docs: DocLike[];
  docTypes: DocTypeLike[];
}): PrefillableField[] {
  const { form, docs, docTypes } = args;
  if (!docs.length || !docTypes.length) return [];

  const typeById = new Map<string, DocTypeLike>();
  for (const dt of docTypes) typeById.set(dt.id, dt);

  // Stable oldest-first order so a passport uploaded before a replacement
  // doesn't lose to the newer upload when both extract the same key.
  const ordered = [...docs].sort((a, b) => {
    const diff = toIsoTimestamp(a.uploaded_at) - toIsoTimestamp(b.uploaded_at);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  const seenTargets = new Set<string>();
  const out: PrefillableField[] = [];

  for (const doc of ordered) {
    if (!doc.document_type_id) continue;
    const type = typeById.get(doc.document_type_id);
    if (!type) continue;
    const extracted = doc.verification_result?.extracted_fields ?? {};
    if (!extracted || typeof extracted !== "object") continue;

    const fields = Array.isArray(type.ai_extraction_fields) ? type.ai_extraction_fields : [];
    for (const f of fields) {
      const target = f.prefill_field;
      if (!target || !PREFILLABLE_SET.has(target)) continue;
      if (seenTargets.has(target)) continue;

      const raw = (extracted as Record<string, unknown>)[f.key];
      if (isEmpty(raw)) continue;
      const value = String(raw).trim();
      if (!value) continue;

      if (!isEmpty(form[target])) continue;

      seenTargets.add(target);
      out.push({
        target,
        value,
        sourceDocId: doc.id,
        sourceDocLabel: type.name,
      });
    }
  }

  return out;
}
