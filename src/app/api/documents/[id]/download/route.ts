import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Try documents table first (new model), then document_uploads (old model)
  let filePath: string | null = null;

  const { data: docRecord } = await supabase
    .from("documents")
    .select("file_path")
    .eq("id", params.id)
    .maybeSingle();

  if (docRecord?.file_path) {
    filePath = docRecord.file_path;
  } else {
    const { data: upload } = await supabase
      .from("document_uploads")
      .select("file_path")
      .eq("id", params.id)
      .maybeSingle();
    filePath = upload?.file_path ?? null;
  }

  if (!filePath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const { data: signedUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(filePath, 3600);

  if (!signedUrl?.signedUrl) {
    return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl.signedUrl });
}
