import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/** POST /api/admin/services — Create a new service */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    service_template_id: string;
    service_details?: Record<string, unknown>;
    roles?: Array<{
      client_profile_id: string;
      role: "director" | "shareholder" | "ubo" | "other";
      can_manage?: boolean;
      shareholding_percentage?: number | null;
    }>;
  };

  if (!body.service_template_id) {
    return NextResponse.json({ error: "service_template_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: service, error: svcErr } = await supabase
    .from("services")
    .insert({
      tenant_id: tenantId,
      service_template_id: body.service_template_id,
      service_details: body.service_details ?? {},
      status: "draft",
    })
    .select("id")
    .single();

  if (svcErr || !service) {
    return NextResponse.json({ error: svcErr?.message ?? "Failed to create service" }, { status: 500 });
  }

  // Insert role links if provided
  if (body.roles && body.roles.length > 0) {
    const roleRows = body.roles.map((r) => ({
      tenant_id: tenantId,
      service_id: service.id,
      client_profile_id: r.client_profile_id,
      role: r.role,
      can_manage: r.can_manage ?? false,
      shareholding_percentage: r.shareholding_percentage ?? null,
    }));
    const { error: rolesErr } = await supabase.from("profile_service_roles").insert(roleRows);
    if (rolesErr) {
      // Service created but roles failed — don't roll back, just report
      return NextResponse.json({ id: service.id, warning: `Service created but roles failed: ${rolesErr.message}` });
    }
  }

  return NextResponse.json({ id: service.id });
}
