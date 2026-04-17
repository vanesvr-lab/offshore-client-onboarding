import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { verifyDocument } from "@/lib/ai/verifyDocument";
import type { VerificationRules } from "@/types";

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
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const supabase = createAdminClient();

  // Verify caller has access to this service
  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: roleCheck } = await supabase
    .from("profile_service_roles")
    .select("id")
    .eq("service_id", serviceId)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!roleCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const documentTypeId = formData.get("documentTypeId") as string | null;

  if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!documentTypeId) return NextResponse.json({ error: "documentTypeId is required" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, JPEG, PNG, WebP, or TIFF." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const filePath = `services/${serviceId}/${documentTypeId}/${Date.now()}-${file.name}`;

  // Upload to storage
  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(filePath, fileBuffer, { contentType: file.type, upsert: true });

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  // Upsert documents row (one per document type per service)
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("service_id", serviceId)
    .eq("document_type_id", documentTypeId)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  let doc;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("documents")
      .update({
        file_name: file.name,
        file_path: filePath,
        verification_status: "pending",
        uploaded_at: new Date().toISOString(),
        uploaded_by: session.user.id,
      })
      .eq("id", existing.id)
      .select("id, file_name, verification_status, uploaded_at, document_types(name, category)")
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
        file_name: file.name,
        file_path: filePath,
        verification_status: "pending",
        is_active: true,
        uploaded_at: new Date().toISOString(),
        uploaded_by: session.user.id,
      })
      .select("id, file_name, verification_status, uploaded_at, document_types(name, category)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    doc = data;
  }

  // Fire AI verification asynchronously (fire-and-forget — response goes back immediately)
  const docId = doc.id as string;
  void (async () => {
    try {
      // Fetch document type's AI verification rules + name
      const { data: docTypeRow } = await supabase
        .from("document_types")
        .select("name, ai_verification_rules")
        .eq("id", documentTypeId)
        .maybeSingle();

      const rules: VerificationRules = (docTypeRow?.ai_verification_rules as VerificationRules | null) ?? {
        extract_fields: [],
        match_rules: [],
      };

      const result = await verifyDocument({
        fileBuffer,
        mimeType: file.type,
        rules,
        applicationContext: { contact_name: null, business_name: null, ubo_data: null },
        documentType: docTypeRow?.name ?? null,
      });

      const verificationStatus =
        result.can_read_document === false ? "manual_review" : result.overall_status;

      await supabase
        .from("documents")
        .update({
          verification_status: verificationStatus,
          verified_at: new Date().toISOString(),
        })
        .eq("id", docId);
    } catch {
      // Verification failure is non-fatal — doc stays as "pending"
    }
  })();

  return NextResponse.json({ document: doc });
}
