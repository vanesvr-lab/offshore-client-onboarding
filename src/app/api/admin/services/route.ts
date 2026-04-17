import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

function getServicePrefix(templateName: string): string {
  const name = templateName.toLowerCase();
  if (name.includes("global business")) return "GBC";
  if (name.includes("authorised") || name.includes("authorized")) return "AC";
  if (name.includes("domestic")) return "DC";
  if (name.includes("trust") || name.includes("foundation")) return "TFF";
  if (name.includes("relocation")) return "RLM";
  if (name.includes("bank account")) return "BAO";
  return "SVC";
}

async function generateServiceNumber(
  supabase: ReturnType<typeof createAdminClient>,
  templateId: string
): Promise<string | null> {
  try {
    const { data: template } = await supabase
      .from("service_templates")
      .select("name")
      .eq("id", templateId)
      .single();

    if (!template?.name) return null;

    const prefix = getServicePrefix(template.name);

    // Find current max for this prefix
    const { data: existing } = await supabase
      .from("services")
      .select("service_number")
      .like("service_number", `${prefix}-%`)
      .order("service_number", { ascending: false })
      .limit(1);

    let nextSeq = 1;
    if (existing && existing.length > 0 && existing[0].service_number) {
      const match = (existing[0].service_number as string).match(/^[A-Z]+-(\d+)$/);
      if (match) nextSeq = parseInt(match[1], 10) + 1;
    }

    return `${prefix}-${String(nextSeq).padStart(4, "0")}`;
  } catch {
    return null;
  }
}

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

  // Auto-generate service_number
  const serviceNumber = await generateServiceNumber(supabase, body.service_template_id);

  const { data: service, error: svcErr } = await supabase
    .from("services")
    .insert({
      tenant_id: tenantId,
      service_template_id: body.service_template_id,
      service_details: body.service_details ?? {},
      status: "draft",
      ...(serviceNumber ? { service_number: serviceNumber } : {}),
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
