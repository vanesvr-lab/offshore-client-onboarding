import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { verifyDocument } from "@/lib/ai/verifyDocument";
import { recordAiExtractionProvenance } from "@/lib/ai/recordProvenance";
import type { AiExtractionField, VerificationRules } from "@/types";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: serviceId } = await params;
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = getTenantId(session);
  const supabase = createAdminClient();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const documentTypeId = formData.get("documentTypeId") as string | null;
  const clientProfileId = (formData.get("clientProfileId") as string | null) || null;

  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!documentTypeId) return NextResponse.json({ error: "documentTypeId is required" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, JPEG, PNG, WebP, or TIFF." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  // Supabase Storage rejects keys containing spaces or several special chars. Sanitize the filename while preserving the extension.
  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const filePath = `services/${serviceId}/${documentTypeId}/${Date.now()}-${safeName || "file"}`;

  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(filePath, fileBuffer, { contentType: file.type, upsert: true });

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { data: docTypeRow } = await supabase
    .from("document_types")
    .select(
      "name, ai_verification_rules, verification_rules_text, ai_enabled, ai_extraction_enabled, ai_extraction_fields"
    )
    .eq("id", documentTypeId)
    .maybeSingle();

  const aiEnabled = docTypeRow?.ai_enabled !== false;
  const initialVerificationStatus = aiEnabled ? "pending" : "not_run";

  // Upsert: one active document per type per service
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("service_id", serviceId)
    .eq("document_type_id", documentTypeId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  const selectFields =
    "id, file_name, mime_type, verification_status, verification_result, uploaded_at, document_type_id, client_profile_id, admin_status, prefill_dismissed_at, document_types(id, name, category)";

  let doc;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("documents")
      .update({
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type,
        verification_status: initialVerificationStatus,
        verification_result: null,
        verified_at: null,
        uploaded_at: new Date().toISOString(),
        uploaded_by: session.user.id,
        admin_status: "pending_review",
        admin_status_note: null,
        admin_status_by: null,
        admin_status_at: null,
        prefill_dismissed_at: null,
        ...(clientProfileId ? { client_profile_id: clientProfileId } : {}),
      })
      .eq("id", existing.id)
      .select(selectFields)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    doc = data;
  } else {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        tenant_id: tenantId,
        service_id: serviceId,
        document_type_id: documentTypeId,
        client_profile_id: clientProfileId,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type,
        verification_status: initialVerificationStatus,
        is_active: true,
        uploaded_at: new Date().toISOString(),
        uploaded_by: session.user.id,
        admin_status: "pending_review",
      })
      .select(selectFields)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    doc = data;
  }

  if (!aiEnabled) {
    return NextResponse.json({ document: doc });
  }

  const docId = doc.id as string;
  void (async () => {
    try {
      const rules: VerificationRules = (docTypeRow?.ai_verification_rules as VerificationRules | null) ?? {
        extract_fields: [],
        match_rules: [],
      };
      const extractionFields = Array.isArray(docTypeRow?.ai_extraction_fields)
        ? (docTypeRow?.ai_extraction_fields as AiExtractionField[])
        : [];

      const result = await verifyDocument({
        fileBuffer,
        mimeType: file.type,
        rules,
        applicationContext: { contact_name: null, business_name: null, ubo_data: null },
        documentType: docTypeRow?.name ?? null,
        plainTextRules: docTypeRow?.verification_rules_text ?? null,
        extractionEnabled: docTypeRow?.ai_extraction_enabled === true,
        aiExtractionFields: extractionFields,
      });

      const verificationStatus =
        result.can_read_document === false ? "manual_review" : result.overall_status;

      await supabase
        .from("documents")
        .update({
          verification_status: verificationStatus,
          verification_result: result as unknown as Record<string, unknown>,
          verified_at: new Date().toISOString(),
        })
        .eq("id", docId);

      // B-070 — record per-field provenance for the admin marker UI.
      if (clientProfileId) {
        await recordAiExtractionProvenance({
          supabase,
          tenantId,
          clientProfileId,
          sourceDocumentId: docId,
          extractedFields: result.extracted_fields ?? null,
          aiExtractionFields: extractionFields,
        });
      }
    } catch {
      // Verification failure is non-fatal; leave row marked as pending so UI retries manually.
    }
  })();

  return NextResponse.json({ document: doc });
}
