import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const token = formData.get("token") as string | null;
  const documentTypeId = formData.get("documentTypeId") as string | null;
  const kycRecordId = formData.get("kycRecordId") as string | null;

  if (!file || !token || !documentTypeId || !kycRecordId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify the token
  const { data: vc } = await supabase
    .from("verification_codes")
    .select("kyc_record_id, verified_at, expires_at")
    .eq("access_token", token)
    .single();

  if (!vc || !vc.verified_at || vc.kyc_record_id !== kycRecordId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (new Date(vc.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  // Get the client_id from the KYC record (needed for the documents table)
  const { data: kycRec } = await supabase
    .from("kyc_records")
    .select("client_id")
    .eq("id", kycRecordId)
    .single();

  if (!kycRec) {
    return NextResponse.json({ error: "KYC record not found" }, { status: 404 });
  }

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `kyc/${kycRecordId}/${documentTypeId}/${Date.now()}.${ext}`;
  const arrayBuf = await file.arrayBuffer();

  const { error: storageErr } = await supabase.storage
    .from("documents")
    .upload(storagePath, arrayBuf, {
      contentType: file.type,
      upsert: false,
    });

  if (storageErr) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Check for existing document of same type for this KYC record
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("kyc_record_id", kycRecordId)
    .eq("document_type_id", documentTypeId)
    .maybeSingle();

  if (existing) {
    // Update existing
    const { error: updateErr } = await supabase
      .from("documents")
      .update({
        file_name: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: null,
        verification_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      return NextResponse.json({ error: "Failed to save document record" }, { status: 500 });
    }

    return NextResponse.json({ uploadId: existing.id, filePath: storagePath });
  }

  // Insert new
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({
      client_id: kycRec.client_id,
      kyc_record_id: kycRecordId,
      document_type_id: documentTypeId,
      file_name: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: null,
      verification_status: "pending",
    })
    .select("id")
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Failed to save document record" }, { status: 500 });
  }

  return NextResponse.json({ uploadId: doc.id, filePath: storagePath });
}
