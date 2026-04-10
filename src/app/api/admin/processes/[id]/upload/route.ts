import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const processDocumentId = formData.get("processDocumentId") as string | null;
  const documentTypeId = formData.get("documentTypeId") as string | null;

  if (!file || !processDocumentId || !documentTypeId) {
    return NextResponse.json({ error: "file, processDocumentId, documentTypeId required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch process to get client_id
  const { data: process } = await supabase
    .from("client_processes")
    .select("client_id")
    .eq("id", params.id)
    .single();

  if (!process) return NextResponse.json({ error: "Process not found" }, { status: 404 });

  const ext = file.name.split(".").pop() ?? "bin";
  const filePath = `library/${process.client_id}/${documentTypeId}/${Date.now()}-admin.${ext}`;

  // Upload to storage
  const { error: storageErr } = await supabase.storage
    .from("documents")
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (storageErr) return NextResponse.json({ error: storageErr.message }, { status: 500 });

  // Insert into documents table
  const { data: docRecord, error: docErr } = await supabase
    .from("documents")
    .insert({
      client_id: process.client_id,
      document_type_id: documentTypeId,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      uploaded_by: session.user.id,
      verification_status: "pending",
    })
    .select()
    .single();

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 500 });

  // Update process_documents
  const now = new Date().toISOString();
  await supabase
    .from("process_documents")
    .update({
      document_id: docRecord.id,
      source: "uploaded",
      status: "received",
      received_at: now,
    })
    .eq("id", processDocumentId);

  // Create document_link
  await supabase.from("document_links").insert({
    document_id: docRecord.id,
    linked_to_type: "process",
    linked_to_id: params.id,
    linked_by: session.user.id,
  });

  revalidatePath(`/admin/clients/${process.client_id}/processes/${params.id}`);
  return NextResponse.json({ document: docRecord });
}
