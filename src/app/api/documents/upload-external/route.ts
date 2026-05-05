import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/documents/upload-external
 *
 * Public document upload from the magic-link KYC flow. The request body
 * is a multipart form with `file`, `token`, `documentTypeId`, and
 * `kycRecordId` (which the new schema treats as the
 * `client_profile_kyc.id` for compatibility — see KycFillClient where
 * `kycRecord.id` is set to the kyc row id, falling back to
 * client_profile_id).
 *
 * B-056 §1.3 — rewritten to use `verification_codes.client_profile_id`
 * (the column that's actually populated). Documents are written with
 * `client_profile_id`, matching the rest of the codebase post-B-009.
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const token = formData.get("token") as string | null;
  const documentTypeId = formData.get("documentTypeId") as string | null;

  if (!file || !token || !documentTypeId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: vc } = await supabase
    .from("verification_codes")
    .select("client_profile_id, verified_at, expires_at, superseded_at")
    .eq("access_token", token)
    .maybeSingle();

  if (!vc || !vc.verified_at || vc.superseded_at) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new Date(vc.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const clientProfileId = vc.client_profile_id;
  if (!clientProfileId) {
    return NextResponse.json({ error: "Profile not linked to invite" }, { status: 404 });
  }

  // Resolve client_id + tenant_id from the profile (documents references both).
  const { data: profile } = await supabase
    .from("client_profiles")
    .select("client_id, tenant_id")
    .eq("id", clientProfileId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `kyc/${clientProfileId}/${documentTypeId}/${Date.now()}.${ext}`;
  const arrayBuf = await file.arrayBuffer();

  const { error: storageErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, arrayBuf, {
      contentType: file.type,
      upsert: false,
    });

  if (storageErr) {
    return NextResponse.json({ error: `Upload failed: ${storageErr.message}` }, { status: 500 });
  }

  // One row per (client_profile, document_type, active) — replace any
  // existing active row for this pair.
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("client_profile_id", clientProfileId)
    .eq("document_type_id", documentTypeId)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) {
    const { error: updateErr } = await supabase
      .from("documents")
      .update({
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: null,
        verification_status: "pending",
        admin_status: "pending_review",
        admin_status_note: null,
        admin_status_by: null,
        admin_status_at: null,
        prefill_dismissed_at: null,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to save document record" }, { status: 500 });
    }

    return NextResponse.json({ uploadId: existing.id, filePath: storagePath });
  }

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      tenant_id: profile.tenant_id,
      client_id: profile.client_id,
      client_profile_id: clientProfileId,
      document_type_id: documentTypeId,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: null,
      verification_status: "pending",
      admin_status: "pending_review",
      is_active: true,
      uploaded_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: `Failed to save document record: ${docErr?.message ?? "unknown"}` }, { status: 500 });
  }

  return NextResponse.json({ uploadId: doc.id, filePath: storagePath });
}
