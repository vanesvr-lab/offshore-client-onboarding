import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  const { data: app, error } = await supabase
    .from("applications")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify ownership (admins can access all)
  if (session.user.role !== "admin") {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!clientUser || app.client_id !== clientUser.client_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const [{ data: requirements }, { data: uploads }] = await Promise.all([
    supabase
      .from("document_requirements")
      .select("*")
      .eq("template_id", app.template_id)
      .order("sort_order"),
    supabase
      .from("document_uploads")
      .select("*")
      .eq("application_id", params.id),
  ]);

  return NextResponse.json({
    application: app,
    requirements: requirements ?? [],
    uploads: uploads ?? [],
  });
}
