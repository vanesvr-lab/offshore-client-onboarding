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
  const filePath = `applications/${applicationId}/${requirementId}/${Date.now()}-${file.name}`;

  // Upload to storage using service role
  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(filePath, fileBuffer, { contentType: file.type, upsert: true });

  if (storageError) {
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  // Upsert document_uploads record
  const { data: upload, error: dbError } = await supabase
    .from("document_uploads")
    .upsert({
      application_id: applicationId,
      requirement_id: requirementId,
      file_path: filePath,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      verification_status: "pending",
      uploaded_by: session.user.id,
      uploaded_at: new Date().toISOString(),
    }, { onConflict: "application_id,requirement_id" })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  revalidatePath(`/applications/${applicationId}`);
  revalidatePath(`/admin/applications/${applicationId}`);
  return NextResponse.json({ upload });
}
