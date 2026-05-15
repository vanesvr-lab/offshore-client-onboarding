import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDocumentsSignedUrl } from "@/lib/supabase/storage";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("submitted_forms")
    .select("id, file_name, file_path")
    .eq("id", params.id)
    .maybeSingle();

  if (!row?.file_path) {
    return NextResponse.json({ error: "Submitted form not found" }, { status: 404 });
  }

  const url = await createDocumentsSignedUrl(supabase, row.file_path);
  if (!url) {
    return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
  }

  return NextResponse.json({ url, name: row.file_name });
}
