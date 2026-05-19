import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { hasDataAccess } from "@/lib/admin-permissions";
import { sendFilingRepInvite } from "@/lib/filing-rep-invite";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Whitelist updatable fields
  const ALLOWED = [
    "full_name", "email", "phone", "address",
    "record_type", "is_representative", "due_diligence_level",
    // B-134 — filing rep delegation via FK. Editing this flips through
    // the data_access=edit gate below and (when changing to a non-null
    // value) sends a magic-link invite to the rep.
    "filing_rep_profile_id",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // B-131/B-134 — rep mutations need data_access=edit. Mirrors create route.
  const repTouched = "filing_rep_profile_id" in updates;
  if (repTouched && !hasDataAccess(session.user.adminPermissions, "edit")) {
    return NextResponse.json(
      { error: "Your role can't change the filing representative." },
      { status: 403 },
    );
  }

  // B-134 — validate the rep profile exists in this tenant and is a
  // representative. DB FK guarantees existence; the role + tenant check
  // happens here.
  if (repTouched && updates.filing_rep_profile_id) {
    const { data: rep } = await supabase
      .from("client_profiles")
      .select("id, is_representative, is_deleted")
      .eq("id", updates.filing_rep_profile_id as string)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!rep || rep.is_deleted || rep.is_representative !== true) {
      return NextResponse.json(
        { error: "Filing rep profile is not a valid representative" },
        { status: 400 },
      );
    }
  }

  const { data: existing } = await supabase
    .from("client_profiles")
    .select(ALLOWED.join(","))
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("client_profiles")
    .update(updates)
    .eq("id", params.id)
    .eq("tenant_id", tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const previous: Record<string, unknown> = {};
  if (existing) {
    const before = existing as unknown as Record<string, unknown>;
    for (const key of Object.keys(updates)) {
      if (key === "updated_at") continue;
      previous[key] = before[key] ?? null;
    }
  }
  const newValue: Record<string, unknown> = { ...updates };
  delete newValue.updated_at;

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "profile_updated",
    entity_type: "client_profile",
    entity_id: params.id,
    previous_value: previous,
    new_value: newValue,
  });

  // B-131/B-134 — send a fresh invite when the rep FK changes to a
  // non-null value (covers both the null→rep and rep→rep cases). When
  // the new value is null we leave any prior users row alone (the rep
  // may still file for other directors); access is revoked simply by
  // the FK-match query coming back empty.
  const beforeRepId = (existing as { filing_rep_profile_id?: string | null } | null)
    ?.filing_rep_profile_id ?? null;
  if (
    repTouched
    && typeof updates.filing_rep_profile_id === "string"
    && updates.filing_rep_profile_id
    && updates.filing_rep_profile_id !== beforeRepId
  ) {
    try {
      const directorName =
        (typeof updates.full_name === "string"
          ? updates.full_name
          : (existing as { full_name?: string | null } | null)?.full_name) ?? "";
      await sendFilingRepInvite({
        supabase,
        repProfileId: updates.filing_rep_profile_id,
        directorName,
        tenantId,
      });
    } catch (err) {
      console.error("[profiles-v2/PATCH] filing rep invite failed", err);
    }
  }

  return NextResponse.json({ success: true });
}
