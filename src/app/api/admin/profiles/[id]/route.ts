import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

// B-114 — write target moved from the legacy `kyc_records` table to the
// modern `client_profiles` table. Prior to this batch, the route was
// silently 200-OK'ing PATCHes that updated rows nobody reads — so the
// inline DD-level selector on `/admin/services/[id]` "succeeded" but the
// value never changed for `client_profiles.due_diligence_level`, which
// is what the rest of the UI reads. Tenant-scoped on lookup + update.

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenantId = getTenantId(session);

  const body = (await request.json()) as {
    email?: string | null;
    due_diligence_level?: string | null;
  };

  const allowed = ["email", "due_diligence_level"];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) update[key] = (body as Record<string, unknown>)[key];
  }

  const { data: current } = await supabase
    .from("client_profiles")
    .select("id, tenant_id, due_diligence_level, email")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from("client_profiles")
    .update(update)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // B-114 — audit row now references `client_profile`. The legacy
  // `kyc_record` value lingered because the prior write target was the
  // legacy table; entity_id semantics flip alongside the table change.
  if (
    "due_diligence_level" in body &&
    body.due_diligence_level !==
      (current as Record<string, unknown> | null)?.due_diligence_level
  ) {
    await supabase.from("audit_log").insert({
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: session.user.name ?? session.user.email ?? "Unknown user",
      action: "profile_dd_level_changed",
      entity_type: "client_profile",
      entity_id: params.id,
      previous_value: {
        due_diligence_level: (current as Record<string, unknown> | null)
          ?.due_diligence_level,
      },
      new_value: { due_diligence_level: body.due_diligence_level },
    });
  }

  return NextResponse.json({ profile: updated });
}
