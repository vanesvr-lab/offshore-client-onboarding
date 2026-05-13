// B-100 — Waive / un-waive a per-profile KYC document requirement.
//
// POST: upserts a row in `waived_document_requirements` and writes a
//       `document_requirement_waived` audit row. Idempotent (re-waiving
//       the same row is a no-op).
// DELETE: removes the row and writes a `document_requirement_unwaived`
//       audit row.
//
// Auth: same pattern as section-reviews / section-override —
// `session.user.role === "admin"`, otherwise 403.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

interface WaiveBody {
  client_profile_id?: string;
  document_type_id?: string;
}

async function readBody(request: Request): Promise<WaiveBody | null> {
  try {
    return (await request.json()) as WaiveBody;
  } catch {
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: serviceId } = await params;
  const body = await readBody(request);
  if (!body || !body.client_profile_id || !body.document_type_id) {
    return NextResponse.json(
      { error: "client_profile_id and document_type_id are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data, error } = await supabase
    .from("waived_document_requirements")
    .upsert(
      {
        tenant_id: tenantId,
        client_profile_id: body.client_profile_id,
        service_id: serviceId,
        document_type_id: body.document_type_id,
        waived_by: session.user.id,
      },
      { onConflict: "client_profile_id,service_id,document_type_id" },
    )
    .select("id, waived_at, waived_by, client_profile_id, service_id, document_type_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "document_requirement_waived",
    entity_type: "client_profile",
    entity_id: body.client_profile_id,
    new_value: {
      service_id: serviceId,
      document_type_id: body.document_type_id,
    },
    detail: {
      service_id: serviceId,
      document_type_id: body.document_type_id,
    },
  });

  return NextResponse.json({ data });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: serviceId } = await params;
  const body = await readBody(request);
  if (!body || !body.client_profile_id || !body.document_type_id) {
    return NextResponse.json(
      { error: "client_profile_id and document_type_id are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { error } = await supabase
    .from("waived_document_requirements")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("client_profile_id", body.client_profile_id)
    .eq("service_id", serviceId)
    .eq("document_type_id", body.document_type_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "document_requirement_unwaived",
    entity_type: "client_profile",
    entity_id: body.client_profile_id,
    new_value: {
      service_id: serviceId,
      document_type_id: body.document_type_id,
    },
    detail: {
      service_id: serviceId,
      document_type_id: body.document_type_id,
    },
  });

  return NextResponse.json({ ok: true });
}
