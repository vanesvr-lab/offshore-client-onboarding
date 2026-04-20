import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const applicationId = formData.get("applicationId") as string;
  const requirementId = formData.get("requirementId") as string;

  if (!file || !applicationId || !requirementId) {
    return NextResponse.json({ error: "file, applicationId and requirementId are required" }, { status: 400 });
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, JPEG, PNG, WebP, or TIFF." }, { status: 400 });
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the application belongs to the session user (or user is admin)
  if (session.user.role !== "admin") {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    const { data: app } = await supabase
      .from("applications")
      .select("client_id")
      .eq("id", applicationId)
      .single();

    if (!app || app.client_id !== clientUser?.client_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  // Supabase Storage rejects keys containing spaces or several special chars. Sanitize the filename while preserving the extension.
  const safeName = file.name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const filePath = `applications/${applicationId}/${requirementId}/${Date.now()}-${safeName || "file"}`;

  // Upload to storage using service role
  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(filePath, fileBuffer, { contentType: file.type, upsert: true });

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  // Look up existing row for this requirement (one upload per requirement)
  const { data: existing } = await supabase
    .from("document_uploads")
    .select("id")
    .eq("application_id", applicationId)
    .eq("requirement_id", requirementId)
    .maybeSingle();

  let upload;
  let dbError;

  if (existing?.id) {
    // Replace the existing row
    const res = await supabase
      .from("document_uploads")
      .update({
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        verification_status: "pending",
        verification_result: null,
        admin_override: null,
        admin_override_note: null,
        verified_at: null,
        uploaded_by: session.user.id,
        uploaded_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    upload = res.data;
    dbError = res.error;
  } else {
    // Insert a new row
    const res = await supabase
      .from("document_uploads")
      .insert({
        application_id: applicationId,
        requirement_id: requirementId,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        verification_status: "pending",
        uploaded_by: session.user.id,
        uploaded_at: new Date().toISOString(),
      })
      .select()
      .single();
    upload = res.data;
    dbError = res.error;
  }

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/admin/applications/${applicationId}`);
  // Return both the legacy `upload` shape and the flat keys the client expects
  return NextResponse.json({
    upload,
    uploadId: upload?.id,
    filePath: upload?.file_path,
  });
}
