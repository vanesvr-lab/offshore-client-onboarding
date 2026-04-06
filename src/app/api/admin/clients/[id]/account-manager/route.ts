import { NextResponse } from "next/server";
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

  const { adminId, currentManagerId, notes } = await request.json();
  if (!adminId) return NextResponse.json({ error: "adminId required" }, { status: 400 });

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // End the current active period if there is one
  if (currentManagerId) {
    const { error } = await supabase
      .from("client_account_managers")
      .update({ ended_at: now })
      .eq("id", currentManagerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert the new manager record
  const { error } = await supabase.from("client_account_managers").insert({
    client_id: params.id,
    admin_id: adminId,
    started_at: now,
    ended_at: null,
    notes: notes?.trim() || null,
    assigned_by: session.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
