import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { verifyDocument, type VerificationContext } from "@/lib/ai/verifyDocument";
import { recordAiExtractionProvenance } from "@/lib/ai/recordProvenance";
import type { AiExtractionField, VerificationRules } from "@/types";

/**
 * B-049 §3.2–3.4 — Run AI verification on a previously-uploaded document
 * using the full cross-form context that's now available.
 *
 * The wizard's per-person "Save & Continue" handler hits this for any docs
 * whose `document_types.ai_deferred = true`. Builds the
 * `VerificationContext` from `client_profile_kyc` (for person-level docs)
 * or from `services + client_profiles` (for application-level docs) and
 * runs `verifyDocument` synchronously so the wizard can refresh the
 * doc-status pill immediately.
 *
 * POST /api/documents/[id]/verify-with-context
 *   no body — context is rebuilt fresh from the DB.
 */
const VERIFICATION_TIMEOUT_MS = 45_000;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: documentId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const supabase = createAdminClient();

  // Load the document + its type config + the client profile KYC row that
  // owns it. We trust the upload route's auth to have already gated who can
  // create the doc — for re-verification we just confirm same tenant and
  // that the doc is active.
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select(
      "id, file_path, mime_type, document_type_id, client_profile_id, service_id, is_active, tenant_id"
    )
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (docErr || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (!doc.is_active) return NextResponse.json({ error: "Document is inactive" }, { status: 410 });
  if (!doc.file_path) return NextResponse.json({ error: "Document has no file" }, { status: 422 });

  const { data: docType } = await supabase
    .from("document_types")
    .select(
      "name, ai_verification_rules, verification_rules_text, ai_enabled, ai_extraction_enabled, ai_extraction_fields, ai_deferred"
    )
    .eq("id", doc.document_type_id)
    .maybeSingle();

  if (!docType) return NextResponse.json({ error: "Document type not found" }, { status: 404 });
  if (docType.ai_enabled === false) {
    // AI explicitly disabled for this type — nothing to do.
    return NextResponse.json({ skipped: true, reason: "ai_enabled=false" });
  }

  // ── Build verification context ────────────────────────────────────────────
  const context: VerificationContext = {
    contact_name: null,
    business_name: null,
    ubo_data: null,
  };

  if (doc.client_profile_id) {
    // Person-level doc: pull profile + KYC row.
    const { data: profile } = await supabase
      .from("client_profiles")
      .select("full_name, address")
      .eq("id", doc.client_profile_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { data: kyc } = await supabase
      .from("client_profile_kyc")
      .select(
        "date_of_birth, nationality, passport_number, address_line_1, address_line_2, address_city, address_state, address_postal_code, address_country, occupation, employer, years_in_role, years_total_experience, industry, source_of_funds_type, source_of_funds_other, source_of_funds_description, source_of_wealth_description"
      )
      .eq("client_profile_id", doc.client_profile_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (profile) {
      context.applicant_full_name = profile.full_name ?? null;
      context.contact_name = profile.full_name ?? null;
    }
    if (kyc) {
      const k = kyc as Record<string, unknown>;
      context.applicant_dob = (k.date_of_birth as string | null) ?? null;
      context.applicant_nationality = (k.nationality as string | null) ?? null;
      context.applicant_passport_number = (k.passport_number as string | null) ?? null;

      // Prefer the structured address; fall back to the legacy free-text on profile.
      const parts = [
        k.address_line_1,
        k.address_line_2,
        k.address_city,
        k.address_state,
        k.address_postal_code,
        k.address_country,
      ]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => v.length > 0);
      context.applicant_residential_address =
        parts.length > 0 ? parts.join(", ") : (profile?.address ?? null);

      context.declared_occupation = (k.occupation as string | null) ?? null;
      context.declared_employer = (k.employer as string | null) ?? null;
      context.declared_years_in_role = (k.years_in_role as number | null) ?? null;
      context.declared_years_total_experience = (k.years_total_experience as number | null) ?? null;
      context.declared_industry = (k.industry as string | null) ?? null;
      context.declared_source_of_funds =
        (k.source_of_funds_type as string | null) ??
        (k.source_of_funds_description as string | null) ??
        null;
      context.declared_source_of_funds_other = (k.source_of_funds_other as string | null) ?? null;
      context.declared_source_of_wealth = (k.source_of_wealth_description as string | null) ?? null;
    }
  } else if (doc.service_id) {
    // Application-level doc: pull the service's primary contact + business name.
    const { data: service } = await supabase
      .from("services")
      .select("service_details")
      .eq("id", doc.service_id)
      .maybeSingle();
    const details = (service?.service_details ?? {}) as Record<string, unknown>;
    context.business_name =
      (details.business_name as string | null) ??
      (details.company_name as string | null) ??
      null;
  }

  // ── Run AI ────────────────────────────────────────────────────────────────
  const { data: fileData, error: storageError } = await supabase.storage
    .from("documents")
    .download(doc.file_path);

  if (storageError || !fileData) {
    return NextResponse.json({ error: "Failed to download document" }, { status: 500 });
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer());
  const rules: VerificationRules = (docType.ai_verification_rules as VerificationRules | null) ?? {
    extract_fields: [],
    match_rules: [],
  };
  const extractionFields = Array.isArray(docType.ai_extraction_fields)
    ? (docType.ai_extraction_fields as AiExtractionField[])
    : [];

  try {
    const result = await Promise.race([
      verifyDocument({
        fileBuffer,
        mimeType: doc.mime_type ?? "application/pdf",
        rules,
        applicationContext: context,
        documentType: docType.name ?? null,
        plainTextRules: docType.verification_rules_text ?? null,
        extractionEnabled: docType.ai_extraction_enabled === true,
        aiExtractionFields: extractionFields,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI verification timed out")), VERIFICATION_TIMEOUT_MS)
      ),
    ]);

    const verificationStatus =
      result.can_read_document === false ? "manual_review" : result.overall_status;

    await supabase
      .from("documents")
      .update({
        verification_status: verificationStatus,
        verification_result: result,
        verified_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    // B-070 — record per-field provenance for the admin marker UI.
    if (doc.client_profile_id) {
      await recordAiExtractionProvenance({
        supabase,
        tenantId,
        clientProfileId: doc.client_profile_id,
        sourceDocumentId: documentId,
        extractedFields: result.extracted_fields ?? null,
        aiExtractionFields: extractionFields,
      });
    }

    return NextResponse.json({ ok: true, verificationStatus, result });
  } catch (err) {
    await supabase
      .from("documents")
      .update({
        verification_status: "manual_review",
        verified_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verification failed" },
      { status: 500 }
    );
  }
}
