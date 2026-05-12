import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/** POST /api/admin/services/[id]/section-override — Upsert a RAG section override */
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
    section_key: string;
    override_status: "green" | "amber" | "red";
    admin_note?: string | null;
  };

  if (!body.section_key || !body.override_status) {
    return NextResponse.json({ error: "section_key and override_status are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: existing } = await supabase
    .from("service_section_overrides")
    .select("override_status, admin_note")
    .eq("service_id", id)
    .eq("section_key", body.section_key)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { error } = await supabase
    .from("service_section_overrides")
    .upsert(
      {
        tenant_id: tenantId,
        service_id: id,
        section_key: body.section_key,
        override_status: body.override_status,
        admin_note: body.admin_note ?? null,
        overridden_by: session.user.id,
        overridden_at: new Date().toISOString(),
      },
      { onConflict: "service_id,section_key" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "service_section_override_set",
    entity_type: "service",
    entity_id: id,
    previous_value: (existing as Record<string, unknown> | null) ?? null,
    new_value: {
      override_status: body.override_status,
      admin_note: body.admin_note ?? null,
    },
    detail: {
      section_key: body.section_key,
      override: body.override_status,
    },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/services/[id]/section-override?key=... — Remove an override */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const sectionKey = url.searchParams.get("key");

  if (!sectionKey) {
    return NextResponse.json({ error: "key query param required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { error } = await supabase
    .from("service_section_overrides")
    .delete()
    .eq("service_id", id)
    .eq("section_key", sectionKey)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
