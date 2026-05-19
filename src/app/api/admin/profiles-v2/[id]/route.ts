import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { hasDataAccess } from "@/lib/admin-permissions";
import {
  sendFilingRepInvite,
  upsertRepUser,
} from "@/lib/filing-rep-invite";

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

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
    // B-131 — filing rep delegation. Editing either of these flips
    // through the data_access=edit gate below and (when filing_rep_email
    // changes to a non-null value) sends a magic-link invite.
    "filing_rep_name", "filing_rep_email",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // B-131 — rep mutations need data_access=edit. Mirrors create route.
  const repTouched =
    "filing_rep_email" in updates || "filing_rep_name" in updates;
  if (repTouched && !hasDataAccess(session.user.adminPermissions, "edit")) {
    return NextResponse.json(
      { error: "Your role can't change the filing representative." },
      { status: 403 },
    );
  }

  // Normalise rep fields + enforce paired-or-neither for the final
  // post-update state (the CHECK constraint will also catch it, but a
  // 400 is a friendlier signal than a 500).
  if (repTouched) {
    let repName = updates.filing_rep_name;
    let repEmail = updates.filing_rep_email;
    if (typeof repName === "string") {
      repName = repName.trim() || null;
      updates.filing_rep_name = repName;
    }
    if (typeof repEmail === "string") {
      const lower = repEmail.trim().toLowerCase() || null;
      if (lower && !isValidEmail(lower)) {
        return NextResponse.json(
          { error: "Filing rep email is not a valid email address" },
          { status: 400 },
        );
      }
      repEmail = lower;
      updates.filing_rep_email = repEmail;
    }
    // Need to know the column not touched in this patch to validate
    // the pair-or-neither rule against the post-update state.
    const { data: existingForRep } = await supabase
      .from("client_profiles")
      .select("filing_rep_name, filing_rep_email")
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const finalName =
      "filing_rep_name" in updates
        ? (updates.filing_rep_name as string | null)
        : ((existingForRep?.filing_rep_name as string | null | undefined) ?? null);
    const finalEmail =
      "filing_rep_email" in updates
        ? (updates.filing_rep_email as string | null)
        : ((existingForRep?.filing_rep_email as string | null | undefined) ?? null);
    if ((finalName && !finalEmail) || (!finalName && finalEmail)) {
      return NextResponse.json(
        { error: "Filing rep name and email must be set together" },
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

  // B-131 — send a fresh invite when the rep email actually changes to
  // a non-null value (covers both the null→email and email→email
  // cases). When the new value is null we leave any prior users row
  // alone (the rep may still be filing for other directors); access is
  // revoked simply by the email-match query coming back empty.
  if (
    repTouched
    && typeof updates.filing_rep_email === "string"
    && updates.filing_rep_email
    && updates.filing_rep_email !== (existing as { filing_rep_email?: string | null } | null)?.filing_rep_email
  ) {
    try {
      const repName =
        (typeof updates.filing_rep_name === "string"
          ? updates.filing_rep_name
          : (existing as { filing_rep_name?: string | null } | null)?.filing_rep_name) ?? "";
      const directorName =
        (typeof updates.full_name === "string"
          ? updates.full_name
          : (existing as { full_name?: string | null } | null)?.full_name) ?? "";
      const repUserId = await upsertRepUser(
        supabase,
        tenantId,
        updates.filing_rep_email,
        repName,
      );
      await sendFilingRepInvite({
        supabase,
        userId: repUserId,
        email: updates.filing_rep_email,
        repName,
        directorName,
        tenantId,
      });
    } catch (err) {
      console.error("[profiles-v2/PATCH] filing rep invite failed", err);
    }
  }

  return NextResponse.json({ success: true });
}
