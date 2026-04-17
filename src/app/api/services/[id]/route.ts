import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/** PATCH /api/services/[id] — Client updates service_details for their managed service */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || !session.user.clientProfileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Verify the client can manage this service
  const { data: roleRows } = await supabase
    .from("profile_service_roles")
    .select("id")
    .eq("service_id", id)
    .eq("client_profile_id", session.user.clientProfileId)
    .eq("can_manage", true)
    .eq("tenant_id", tenantId)
    .limit(1);

  if (!roleRows || roleRows.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;

  // Clients can only update service_details and status (draft → submitted)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("service_details" in body) patch.service_details = body.service_details;
  if ("status" in body && body.status === "submitted") patch.status = "submitted";

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("services")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
