import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/** POST /api/admin/services/[id]/roles — Link a profile to a service */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    client_profile_id: string;
    role: "director" | "shareholder" | "ubo" | "other";
    can_manage?: boolean;
    shareholding_percentage?: number | null;
  };

  if (!body.client_profile_id || !body.role) {
    return NextResponse.json({ error: "client_profile_id and role are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Verify service belongs to this tenant
  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!svc) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("profile_service_roles")
    .insert({
      tenant_id: tenantId,
      service_id: id,
      client_profile_id: body.client_profile_id,
      role: body.role,
      can_manage: body.can_manage ?? false,
      shareholding_percentage: body.shareholding_percentage ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.code === "23505" ? "This profile already has this role on this service" : error.message },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }

  return NextResponse.json({ id: data.id });
}
