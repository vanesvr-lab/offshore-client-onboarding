import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

async function verifyCaller(serviceId: string, tenantId: string, clientProfileId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profile_service_roles")
    .select("id")
    .eq("service_id", serviceId)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { id: serviceId, roleId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allowed = await verifyCaller(serviceId, tenantId, clientProfileId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { shareholding_percentage: number };
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("profile_service_roles")
    .update({ shareholding_percentage: body.shareholding_percentage })
    .eq("id", roleId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; roleId: string }> }
) {
  const { id: serviceId, roleId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allowed = await verifyCaller(serviceId, tenantId, clientProfileId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profile_service_roles")
    .delete()
    .eq("id", roleId)
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
