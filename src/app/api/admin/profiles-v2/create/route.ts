import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { hasDataAccess } from "@/lib/admin-permissions";
import { sendFilingRepInvite } from "@/lib/filing-rep-invite";

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    full_name: string;
    email?: string | null;
    phone?: string | null;
    record_type?: "individual" | "organisation";
    is_representative?: boolean;
    due_diligence_level?: "sdd" | "cdd" | "edd";
    // B-134 — directors point at a rep profile (where is_representative=true)
    // via this FK. Replaces B-131's filing_rep_name + filing_rep_email
    // text columns.
    filing_rep_profile_id?: string | null;
  };

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }

  const repProfileId = body.filing_rep_profile_id ?? null;
  if (repProfileId && !hasDataAccess(session.user.adminPermissions, "edit")) {
    return NextResponse.json(
      { error: "Your role can't assign a filing representative." },
      { status: 403 },
    );
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // B-134 — validate that the referenced rep profile exists in this
  // tenant and is actually a representative. The DB FK enforces
  // existence; the is_representative + tenant_id check happens here.
  if (repProfileId) {
    const { data: rep } = await supabase
      .from("client_profiles")
      .select("id, is_representative, is_deleted")
      .eq("id", repProfileId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!rep || rep.is_deleted || rep.is_representative !== true) {
      return NextResponse.json(
        { error: "Filing rep profile is not a valid representative" },
        { status: 400 },
      );
    }
  }

  const trimmedEmail = body.email?.trim() ?? "";

  // B-059: lookup-then-insert. If an active profile already exists for
  // (tenant_id, email), reuse it rather than creating a duplicate.
  if (trimmedEmail) {
    const { data: existing } = await supabase
      .from("client_profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("email", trimmedEmail)
      .eq("is_deleted", false)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ id: existing.id, linkedExisting: true });
    }
  }

  // Create client_profile
  const { data: profile, error: profileErr } = await supabase
    .from("client_profiles")
    .insert({
      tenant_id: tenantId,
      full_name: body.full_name.trim(),
      email: trimmedEmail || null,
      phone: body.phone?.trim() || null,
      record_type: body.record_type ?? "individual",
      is_representative: body.is_representative ?? false,
      due_diligence_level: body.due_diligence_level ?? "cdd",
      filing_rep_profile_id: repProfileId,
    })
    .select("id")
    .single();

  if (profileErr || !profile) {
    // Race: another request created the same email-keyed profile first.
    if (profileErr?.code === "23505" && trimmedEmail) {
      const { data: refetch } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("email", trimmedEmail)
        .eq("is_deleted", false)
        .maybeSingle();
      if (refetch) {
        return NextResponse.json({ id: refetch.id, linkedExisting: true });
      }
    }
    return NextResponse.json(
      { error: profileErr?.message ?? "Failed to create profile" },
      { status: 500 }
    );
  }

  // Create skeleton client_profile_kyc (1:1)
  if (!body.is_representative) {
    await supabase.from("client_profile_kyc").insert({
      tenant_id: tenantId,
      client_profile_id: profile.id,
      completion_status: "incomplete",
      kyc_journey_completed: false,
    });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "profile_created",
    entity_type: "client_profile",
    entity_id: profile.id,
    previous_value: null,
    new_value: {
      id: profile.id,
      full_name: body.full_name.trim(),
      record_type: body.record_type ?? "individual",
      is_representative: body.is_representative ?? false,
      filing_rep_profile_id: repProfileId,
    },
  });

  // B-131/B-134 — invite the rep when one was attached. Best-effort:
  // failures log but don't fail the create.
  if (repProfileId) {
    try {
      await sendFilingRepInvite({
        supabase,
        repProfileId,
        directorName: body.full_name.trim(),
        tenantId,
      });
    } catch (err) {
      console.error("[profiles-v2/create] filing rep invite failed", err);
    }
  }

  return NextResponse.json({ id: profile.id });
}
