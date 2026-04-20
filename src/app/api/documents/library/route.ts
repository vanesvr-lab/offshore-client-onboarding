import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDocument } from "@/lib/ai/verifyDocument";
import type { AiExtractionField, DocumentType } from "@/types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const supabase = createAdminClient();

  let query = supabase
    .from("documents")
    .select("*, document_types(*), document_links(*)")
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });

  const kycRecordId = searchParams.get("kycRecordId");
  if (kycRecordId) query = query.eq("kyc_record_id", kycRecordId);

  const documentTypeId = searchParams.get("documentTypeId");
  if (documentTypeId) query = query.eq("document_type_id", documentTypeId);

  const category = searchParams.get("category");
  if (category) {
    // Join filter by document_types.category — use the document_type_id list
    const { data: dtIds } = await supabase
      .from("document_types")
      .select("id")
      .eq("category", category);
    const ids = (dtIds ?? []).map((d: { id: string }) => d.id);
    if (ids.length > 0) query = query.in("document_type_id", ids);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("clientId") as string;
  const documentTypeId = formData.get("documentTypeId") as string;
  const kycRecordId = (formData.get("kycRecordId") as string) || null;
  const expiryDate = (formData.get("expiryDate") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  if (!file || !clientId || !documentTypeId) {
    return NextResponse.json(
      { error: "file, clientId, and documentTypeId are required" },
      { status: 400 }
    );
  }

  const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"];
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, JPEG, PNG, WebP, or TIFF." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch document type for AI verification context
  const { data: docType } = await supabase
    .from("document_types")
    .select("*")
    .eq("id", documentTypeId)
    .single();

  const filePath = `library/${clientId}/${documentTypeId}/${Date.now()}-${file.name}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(filePath, fileBuffer, { contentType: file.type, upsert: true });

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  // Deactivate any existing active documents of the same type for this client/KYC record
  // This prevents duplicate rows when re-uploading
  const deactivateQuery = supabase
    .from("documents")
    .update({ is_active: false })
    .eq("client_id", clientId)
    .eq("document_type_id", documentTypeId)
    .eq("is_active", true);
  if (kycRecordId) {
    deactivateQuery.eq("kyc_record_id", kycRecordId);
  }
  await deactivateQuery;

  const typedDocType = docType as DocumentType | null;
  const aiEnabled = typedDocType?.ai_enabled !== false;
  const initialVerificationStatus = aiEnabled ? "pending" : "not_run";

  // Insert new document record
  const { data: doc, error: dbError } = await supabase
    .from("documents")
    .insert({
      client_id: clientId,
      kyc_record_id: kycRecordId,
      document_type_id: documentTypeId,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      verification_status: initialVerificationStatus,
      expiry_date: expiryDate || null,
      notes: notes || null,
      uploaded_by: session.user.id,
      uploaded_at: new Date().toISOString(),
      admin_status: "pending_review",
      prefill_dismissed_at: null,
    })
    .select()
    .single();

  if (dbError || !doc) {
    return NextResponse.json({ error: dbError?.message ?? "Insert failed" }, { status: 500 });
  }

  // Run AI verification in background when enabled.
  if (aiEnabled) {
    runAiVerification(doc.id, fileBuffer, file.type, typedDocType).catch(() => {});
  }

  revalidatePath(`/admin/clients/${clientId}/documents`);

  return NextResponse.json({ document: doc });
}

async function runAiVerification(
  documentId: string,
  fileBuffer: Buffer,
  mimeType: string,
  docType: DocumentType | null
) {
  const supabase = createAdminClient();

  // Build minimal verification rules from document type
  const rules = (docType?.ai_verification_rules as {
    extract_fields?: string[];
    match_rules?: unknown[];
    document_type_expected?: string;
  } | null) ?? null;

  const verifyRules = {
    extract_fields: rules?.extract_fields ?? ["document_type", "name", "date", "expiry_date"],
    match_rules: (rules?.match_rules as import("@/types").MatchRule[]) ?? [],
    document_type_expected: rules?.document_type_expected ?? docType?.name ?? undefined,
  };

  const extractionFields = Array.isArray(docType?.ai_extraction_fields)
    ? (docType?.ai_extraction_fields as AiExtractionField[])
    : [];

  try {
    const result = await verifyDocument({
      fileBuffer,
      mimeType,
      rules: verifyRules,
      applicationContext: { contact_name: null, business_name: null, ubo_data: null },
      documentType: docType?.name ?? null,
      plainTextRules: docType?.verification_rules_text ?? null,
      extractionEnabled: docType?.ai_extraction_enabled === true,
      aiExtractionFields: extractionFields,
    });

    await supabase
      .from("documents")
      .update({
        verification_status: result.overall_status,
        verification_result: result as unknown as Record<string, unknown>,
        verified_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  } catch {
    await supabase
      .from("documents")
      .update({ verification_status: "manual_review" })
      .eq("id", documentId);
  }
}
