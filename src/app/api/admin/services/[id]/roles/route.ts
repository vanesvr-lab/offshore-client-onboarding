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

/** POST /api/admin/services/[id]/roles — Link an existing profile or create a new one */
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
    client_profile_id?: string;
    role: "director" | "shareholder" | "ubo" | "other";
    can_manage?: boolean;
    shareholding_percentage?: number | null;
    // For creating a new profile:
    full_name?: string;
    email?: string | null;
    record_type?: "individual" | "organisation";
    // B-131 — when creating a new profile inline, parity with
    // CreateProfileDialog: is_representative, due_diligence_level,
    // and the optional filing rep.
    is_representative?: boolean;
    due_diligence_level?: "sdd" | "cdd" | "edd";
    filing_rep_name?: string | null;
    filing_rep_email?: string | null;
  };

  if (!body.role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  if (!body.client_profile_id && !body.full_name) {
    return NextResponse.json({ error: "client_profile_id or full_name is required" }, { status: 400 });
  }

  // B-131 — validate + permission-gate filing rep fields when supplied
  // inline. (Same rules as the create-profile route.) Only meaningful
  // when also creating a new profile inline; if client_profile_id is
  // supplied, the rep is set via the dedicated profiles PATCH route.
  const repName = body.filing_rep_name?.trim() || null;
  const repEmail = body.filing_rep_email?.trim().toLowerCase() || null;
  if (!body.client_profile_id) {
    if ((repName && !repEmail) || (!repName && repEmail)) {
      return NextResponse.json(
        { error: "Filing rep name and email must be set together" },
        { status: 400 },
      );
    }
    if (repEmail && !isValidEmail(repEmail)) {
      return NextResponse.json(
        { error: "Filing rep email is not a valid email address" },
        { status: 400 },
      );
    }
    if (repEmail && !hasDataAccess(session.user.adminPermissions, "edit")) {
      return NextResponse.json(
        { error: "Your role can't assign a filing representative." },
        { status: 403 },
      );
    }
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Verify service belongs to this tenant
  const { data: svc } = await supabase
    .from("services")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!svc) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  let profileId = body.client_profile_id;

  // Create new profile if no existing profile ID provided
  if (!profileId && body.full_name) {
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
        profileId = existing.id;
      }
    }

    if (!profileId) {
      const { data: profile, error: profileError } = await supabase
        .from("client_profiles")
        .insert({
          tenant_id: tenantId,
          user_id: null,
          record_type: body.record_type ?? "individual",
          is_representative: body.is_representative ?? false,
          full_name: body.full_name,
          email: body.email ?? null,
          due_diligence_level: body.due_diligence_level ?? "cdd",
          filing_rep_name: repName,
          filing_rep_email: repEmail,
        })
        .select("id")
        .single();

      if (profileError) {
        // Race: another request created the same email-keyed profile first.
        if (profileError.code === "23505" && trimmedEmail) {
          const { data: refetch } = await supabase
            .from("client_profiles")
            .select("id")
            .eq("tenant_id", tenantId)
            .ilike("email", trimmedEmail)
            .eq("is_deleted", false)
            .maybeSingle();
          if (refetch) {
            profileId = refetch.id;
          }
        }
        if (!profileId) {
          return NextResponse.json({ error: profileError.message }, { status: 500 });
        }
      } else {
        profileId = profile.id;
        await supabase.from("client_profile_kyc").insert({
          tenant_id: tenantId,
          client_profile_id: profile.id,
          completion_status: "incomplete",
          kyc_journey_completed: false,
          sanctions_checked: false,
          adverse_media_checked: false,
          pep_verified: false,
        });

        // B-131 — best-effort filing rep invite when the inline-created
        // profile has a rep attached.
        if (repEmail && repName) {
          try {
            const repUserId = await upsertRepUser(
              supabase,
              tenantId,
              repEmail,
              repName,
            );
            await sendFilingRepInvite({
              supabase,
              userId: repUserId,
              email: repEmail,
              repName,
              directorName: body.full_name ?? "",
              tenantId,
            });
          } catch (err) {
            console.error(
              "[services/roles] filing rep invite failed",
              err,
            );
          }
        }
      }
    }
  }

  const { data, error } = await supabase
    .from("profile_service_roles")
    .insert({
      tenant_id: tenantId,
      service_id: id,
      client_profile_id: profileId!,
      role: body.role,
      can_manage: body.can_manage ?? false,
      shareholding_percentage: body.shareholding_percentage ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.code === "23505" ? "This profile already has this role on this service" : error.message },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "service_role_assigned",
    entity_type: "service",
    entity_id: id,
    previous_value: null,
    new_value: { role_id: data.id, role: body.role, client_profile_id: profileId },
    detail: { role: body.role, profile_id: profileId },
  });

  return NextResponse.json({ id: data.id, client_profile_id: profileId });
}
