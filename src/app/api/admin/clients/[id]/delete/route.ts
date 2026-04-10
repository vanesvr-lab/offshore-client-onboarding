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

  const { confirmationText } = await request.json() as { confirmationText?: string };
  if (confirmationText !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch client name for audit
  const { data: client } = await supabase
    .from("clients")
    .select("id, company_name")
    .eq("id", params.id)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Soft-delete: mark client
  const { error: clientErr } = await supabase
    .from("clients")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: session.user.id,
    })
    .eq("id", params.id);
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });

  // Soft-delete all profiles linked via client_users
  const { data: linked } = await supabase
    .from("client_users")
    .select("user_id")
    .eq("client_id", params.id);

  const userIds = (linked ?? []).map((r) => r.user_id);
  if (userIds.length > 0) {
    await supabase
      .from("profiles")
      .update({ is_deleted: true })
      .in("id", userIds);
  }

  // Fetch admin name for audit
  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", session.user.id)
    .maybeSingle();

  // Create audit log entry
  await supabase.from("audit_log").insert({
    action: "client_deleted",
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: adminProfile?.full_name ?? session.user.email,
    entity_type: "client",
    entity_id: params.id,
    detail: {
      client_name: client.company_name,
      deleted_by_name: adminProfile?.full_name ?? session.user.email,
    },
  });

  revalidatePath("/admin/clients");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/applications");

  return NextResponse.json({ success: true });
}
