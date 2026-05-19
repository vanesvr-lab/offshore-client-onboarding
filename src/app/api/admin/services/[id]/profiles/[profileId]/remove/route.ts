// B-101 Batch 3 — Soft-delete a profile from a service.
//
// POST: upsert a row in `service_profile_removals` for
//       (service_id, client_profile_id). Idempotent — re-removing a
//       profile that's already removed is a no-op. Writes a
//       `profile_removed_from_service` audit row.
//
// Underlying `profile_service_roles` rows stay intact so future
// re-adding the profile to the service restores the role assignments
// without an explicit restore UI (see tech-debt: "No UI to restore
// removed profiles").
//
// Auth: same pattern as section-reviews / waive-document —
// `session.user.role === "admin"`, otherwise 403.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; profileId: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // B-127 — soft-deleting a profile from a service is a destructive
  // action; gated on `destructive_actions`.
  if (!session.user.adminPermissions?.destructive_actions) {
    return NextResponse.json(
      { error: "Your role doesn't have permission to remove profiles." },
      { status: 403 },
    );
  }

  const { id: serviceId, profileId } = await params;
  if (!serviceId || !profileId) {
    return NextResponse.json(
      { error: "service id and profile id are required" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { error } = await supabase
    .from("service_profile_removals")
    .upsert(
      {
        tenant_id: tenantId,
        service_id: serviceId,
        client_profile_id: profileId,
        removed_by: session.user.id,
      },
      { onConflict: "service_id,client_profile_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "profile_removed_from_service",
    entity_type: "client_profile",
    entity_id: profileId,
    new_value: { service_id: serviceId },
    detail: { service_id: serviceId },
  });

  return NextResponse.json({ ok: true });
}
