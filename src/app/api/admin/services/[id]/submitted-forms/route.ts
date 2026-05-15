import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import {
  DOCUMENTS_BUCKET,
  sanitizeFilename,
  submittedFormPath,
} from "@/lib/supabase/storage";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const actionKey = url.searchParams.get("action_key");

  const supabase = createAdminClient();

  let query = supabase
    .from("submitted_forms")
    .select("*")
    .eq("service_id", params.id)
    .order("uploaded_at", { ascending: false });

  if (actionKey) {
    query = query.eq("action_key", actionKey);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submittedForms: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const actionKey = formData.get("action_key") as string | null;
  const referenceFormId = formData.get("reference_form_id") as string | null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  if (!file || !actionKey || !referenceFormId) {
    return NextResponse.json(
      { error: "file, action_key and reference_form_id are required" },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Use PDF, DOC/DOCX, JPEG, or PNG." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the service exists.
  const { data: service } = await supabase
    .from("services")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Verify the reference form exists (it may be deactivated — that's fine,
  // we still allow uploads against the historical version).
  const { data: form } = await supabase
    .from("reference_forms")
    .select("id, action_key")
    .eq("id", referenceFormId)
    .maybeSingle();
  if (!form) {
    return NextResponse.json({ error: "Reference form not found" }, { status: 404 });
  }
  if (form.action_key !== actionKey) {
    return NextResponse.json(
      { error: "Reference form action_key does not match the submission" },
      { status: 400 },
    );
  }

  const filePath = submittedFormPath(params.id, actionKey, referenceFormId, file.name);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: storageError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, fileBuffer, { contentType: file.type, upsert: false });
  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("submitted_forms")
    .insert({
      service_id: params.id,
      action_key: actionKey,
      reference_form_id: referenceFormId,
      file_path: filePath,
      file_name: sanitizeFilename(file.name),
      notes,
      uploaded_by: session.user.id,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    // Clean up the uploaded file if the row insert fails — otherwise we'd
    // leak storage and the user would see an error with no DB row.
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to record submitted form" },
      { status: 500 },
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "submitted_form_uploaded",
    entity_type: "submitted_form",
    entity_id: inserted.id,
    new_value: {
      service_id: params.id,
      action_key: actionKey,
      reference_form_id: referenceFormId,
    },
    detail: { file_name: inserted.file_name },
  });

  revalidatePath(`/admin/services/${params.id}`);
  return NextResponse.json({ submittedForm: inserted });
}
