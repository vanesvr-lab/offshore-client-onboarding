// B-100 / B-106 — Waive / un-waive a document requirement on this service.
//
// POST: upserts a row in `waived_document_requirements` and writes an
//       audit row. Idempotent (re-waiving the same row is a no-op).
// DELETE: removes the row and writes an audit row.
//
// B-106 — body now carries an explicit `scope`:
//   - "person" → KYC document requirement waiver, must include
//     `client_profile_id` (matches B-100 behaviour).
//   - "application" → service-level document waiver, `client_profile_id`
//     must be null/omitted. Service waivers de-dupe via the partial
//     unique index `waived_doc_reqs_service_unique`.
//
// Auth: same pattern as section-reviews / section-override —
// `session.user.role === "admin"`, otherwise 403.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

type WaiveScope = "person" | "application";

interface WaiveBody {
  scope?: WaiveScope;
  client_profile_id?: string | null;
  document_type_id?: string;
}

async function readBody(request: Request): Promise<WaiveBody | null> {
  try {
    return (await request.json()) as WaiveBody;
  } catch {
    return null;
  }
}

function validateScopeBody(body: WaiveBody | null): { ok: true; scope: WaiveScope; profileId: string | null; docTypeId: string } | { ok: false; error: string } {
  if (!body || !body.document_type_id) {
    return { ok: false, error: "document_type_id is required" };
  }
  // B-106 — default to "person" so existing callers (B-100 admin KYC waive)
  // keep working without an immediate client update. New service-waive
  // callers must pass scope explicitly.
  const scope: WaiveScope = body.scope ?? "person";
  if (scope !== "person" && scope !== "application") {
    return { ok: false, error: "scope must be 'person' or 'application'" };
  }
  if (scope === "person") {
    if (!body.client_profile_id) {
      return { ok: false, error: "client_profile_id is required for scope='person'" };
    }
    return { ok: true, scope, profileId: body.client_profile_id, docTypeId: body.document_type_id };
  }
  // scope === "application"
  if (body.client_profile_id) {
    return { ok: false, error: "client_profile_id must be omitted for scope='application'" };
  }
  return { ok: true, scope, profileId: null, docTypeId: body.document_type_id };
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
  const validation = validateScopeBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { scope, profileId, docTypeId } = validation;

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // B-106 — Partial unique indexes per scope make a single onConflict
  // clause awkward (Supabase JS doesn't expose partial-index targets).
  // Look up + branch on existence instead. Idempotent: a duplicate
  // attempt returns the existing row.
  const existingQuery = supabase
    .from("waived_document_requirements")
    .select("id, waived_at, waived_by, client_profile_id, service_id, document_type_id, scope")
    .eq("tenant_id", tenantId)
    .eq("service_id", serviceId)
    .eq("document_type_id", docTypeId)
    .eq("scope", scope);
  const { data: existing } = scope === "person"
    ? await existingQuery.eq("client_profile_id", profileId!).maybeSingle()
    : await existingQuery.is("client_profile_id", null).maybeSingle();

  let row = existing;
  if (!row) {
    const { data: inserted, error } = await supabase
      .from("waived_document_requirements")
      .insert({
        tenant_id: tenantId,
        client_profile_id: profileId,
        service_id: serviceId,
        document_type_id: docTypeId,
        scope,
        waived_by: session.user.id,
      })
      .select("id, waived_at, waived_by, client_profile_id, service_id, document_type_id, scope")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    row = inserted;
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "document_requirement_waived",
    entity_type: scope === "person" ? "client_profile" : "service",
    entity_id: scope === "person" ? profileId! : serviceId,
    new_value: {
      service_id: serviceId,
      document_type_id: docTypeId,
      scope,
    },
    detail: {
      service_id: serviceId,
      document_type_id: docTypeId,
      scope,
    },
  });

  return NextResponse.json({ data: row });
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
  const validation = validateScopeBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const { scope, profileId, docTypeId } = validation;

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  let deleteQuery = supabase
    .from("waived_document_requirements")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("service_id", serviceId)
    .eq("document_type_id", docTypeId)
    .eq("scope", scope);
  deleteQuery = scope === "person"
    ? deleteQuery.eq("client_profile_id", profileId!)
    : deleteQuery.is("client_profile_id", null);
  const { error } = await deleteQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "document_requirement_unwaived",
    entity_type: scope === "person" ? "client_profile" : "service",
    entity_id: scope === "person" ? profileId! : serviceId,
    new_value: {
      service_id: serviceId,
      document_type_id: docTypeId,
      scope,
    },
    detail: {
      service_id: serviceId,
      document_type_id: docTypeId,
      scope,
    },
  });

  return NextResponse.json({ ok: true });
}
