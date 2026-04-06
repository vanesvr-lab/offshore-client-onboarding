import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // Verify ownership
  const { data: app } = await supabase
    .from("applications")
    .select("client_id, status")
    .eq("id", params.id)
    .single();

  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

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

  await supabase.from("applications").update({
    status: "submitted",
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", params.id);

  await supabase.from("audit_log").insert({
    application_id: params.id,
    actor_id: session.user.id,
    action: "application_submitted",
    detail: { previous_status: app.status },
  });

  return NextResponse.json({ success: true });
}
