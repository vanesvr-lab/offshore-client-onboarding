// B-078 Batch 3 — unified Save endpoint for the admin per-profile view.
// One PATCH applies up to three concurrent diffs in a single request:
//
//   - kyc_fields      → columns of `client_profile_kyc`
//   - profile_fields  → columns of `client_profiles` (full_name / email / phone)
//   - roles           → add + remove rows on `profile_service_roles`
//
// Returns the post-update state of all three so the client can reset its
// `savedFields` snapshot without a second fetch. Audit writes are intentionally
// deferred to Batch 6 — this route only persists state.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

type ServiceRoleType = "director" | "shareholder" | "ubo" | "other";

interface KycFieldsBody {
  kyc_fields?: Record<string, unknown>;
  profile_fields?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  roles?: {
    service_id: string;
    add?: Array<{ service_role_type: ServiceRoleType }>;
    remove?: Array<{ id: string }>;
  };
}

// Whitelisted columns of `client_profile_kyc`. Keys outside this set are
// silently dropped — protects against accidental injection of system
// columns (id, tenant_id, created_at, etc.) via a malicious client.
const KYC_FIELD_ALLOWED = new Set<string>([
  // Individual identity
  "aliases",
  "date_of_birth",
  "nationality",
  "passport_country",
  "passport_number",
  "passport_expiry",
  // Address (free-form lives on client_profiles.address; structured here)
  "address_line_1",
  "address_line_2",
  "address_city",
  "address_state",
  "address_postal_code",
  "address_country",
  // Financial
  "occupation",
  "employer",
  "industry",
  "source_of_funds_type",
  "source_of_funds_other",
  "source_of_funds_description",
  "source_of_wealth_description",
  "work_address",
  "work_phone",
  "work_email",
  // Compliance / declarations
  "is_pep",
  "pep_details",
  "legal_issues_declared",
  "legal_issues_details",
  "tax_identification_number",
  "relationship_history",
  "geographic_risk_assessment",
  // Organisation
  "company_registration_number",
  "jurisdiction_incorporated",
  "date_of_incorporation",
  "industry_sector",
  "listed_or_unlisted",
  "description_activity",
  "jurisdiction_tax_residence",
  "regulatory_licenses",
  "business_website",
  // Admin risk overrides (read-only on this surface today, but allowed)
  "sanctions_checked",
  "sanctions_checked_at",
  "sanctions_notes",
  "adverse_media_checked",
  "adverse_media_checked_at",
  "adverse_media_notes",
  "pep_verified",
  "pep_verified_at",
  "pep_verified_notes",
  "risk_rating",
  "risk_rating_justification",
  // EDD
  "risk_flags",
  "senior_management_approval",
  "ongoing_monitoring_plan",
  // Progress
  "completion_status",
  "kyc_journey_completed",
]);

const PROFILE_FIELD_ALLOWED = new Set<string>([
  "full_name",
  "email",
  "phone",
]);

const DATE_FIELDS = new Set<string>([
  "date_of_birth",
  "passport_expiry",
  "date_of_incorporation",
  "sanctions_checked_at",
  "adverse_media_checked_at",
  "pep_verified_at",
]);
const BOOLEAN_FIELDS = new Set<string>([
  "is_pep",
  "legal_issues_declared",
  "sanctions_checked",
  "adverse_media_checked",
  "pep_verified",
  "kyc_journey_completed",
  "senior_management_approval",
]);

const ROLE_TYPES = new Set<ServiceRoleType>([
  "director",
  "shareholder",
  "ubo",
  "other",
]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profileId = params.id;
  const body = (await request.json()) as KycFieldsBody;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Confirm profile is real and belongs to this tenant before touching
  // any of the three target tables.
  const { data: profile, error: lookupError } = await supabase
    .from("client_profiles")
    .select("id, full_name, email, phone")
    .eq("id", profileId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // B-078 Batch 6 — capture pre-update state for the audit_log row.
  const { data: preKyc } = await supabase
    .from("client_profile_kyc")
    .select("*")
    .eq("client_profile_id", profileId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  let preRoles: Array<{ id: string; role: string; service_id: string }> = [];
  if (body.roles && body.roles.service_id) {
    const { data: rolesData } = await supabase
      .from("profile_service_roles")
      .select("id, role, service_id")
      .eq("client_profile_id", profileId)
      .eq("service_id", body.roles.service_id)
      .eq("tenant_id", tenantId);
    preRoles = (rolesData ?? []) as typeof preRoles;
  }

  // ── client_profile_kyc ──────────────────────────────────────────────────
  if (body.kyc_fields && Object.keys(body.kyc_fields).length > 0) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(body.kyc_fields)) {
      if (!KYC_FIELD_ALLOWED.has(key)) continue;
      let value = raw;
      if ((DATE_FIELDS.has(key) || BOOLEAN_FIELDS.has(key)) && value === "") {
        value = null;
      }
      cleaned[key] = value;
    }
    if (Object.keys(cleaned).length > 0) {
      cleaned.updated_at = new Date().toISOString();
      const { error: kycError } = await supabase
        .from("client_profile_kyc")
        .update(cleaned)
        .eq("client_profile_id", profileId)
        .eq("tenant_id", tenantId);
      if (kycError) {
        return NextResponse.json({ error: kycError.message }, { status: 500 });
      }
    }
  }

  // ── client_profiles (full_name / email / phone) ─────────────────────────
  if (body.profile_fields && Object.keys(body.profile_fields).length > 0) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(body.profile_fields)) {
      if (!PROFILE_FIELD_ALLOWED.has(key)) continue;
      cleaned[key] =
        raw === undefined || raw === ""
          ? key === "full_name"
            ? cleaned[key] // skip empty full_name (handled below)
            : null
          : raw;
    }
    if (Object.keys(cleaned).length > 0) {
      cleaned.updated_at = new Date().toISOString();
      const { error: profileError } = await supabase
        .from("client_profiles")
        .update(cleaned)
        .eq("id", profileId)
        .eq("tenant_id", tenantId);
      if (profileError) {
        // Surface the (tenant_id, lower(email)) unique violation cleanly.
        const status = profileError.code === "23505" ? 409 : 500;
        return NextResponse.json({ error: profileError.message }, { status });
      }
    }
  }

  // ── profile_service_roles ───────────────────────────────────────────────
  if (body.roles && body.roles.service_id) {
    const serviceId = body.roles.service_id;
    // Verify service belongs to tenant before mutating role rows.
    const { data: svc } = await supabase
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!svc) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    const adds = body.roles.add ?? [];
    const removes = body.roles.remove ?? [];
    for (const r of removes) {
      if (!r.id) continue;
      const { error: removeError } = await supabase
        .from("profile_service_roles")
        .delete()
        .eq("id", r.id)
        .eq("service_id", serviceId)
        .eq("tenant_id", tenantId);
      if (removeError) {
        return NextResponse.json(
          { error: removeError.message },
          { status: 500 },
        );
      }
    }
    for (const a of adds) {
      if (!ROLE_TYPES.has(a.service_role_type)) continue;
      const { error: addError } = await supabase
        .from("profile_service_roles")
        .insert({
          tenant_id: tenantId,
          service_id: serviceId,
          client_profile_id: profileId,
          role: a.service_role_type,
          can_manage: false,
          shareholding_percentage: null,
        });
      if (addError && addError.code !== "23505") {
        // 23505 = duplicate (already has this role); treat as no-op.
        return NextResponse.json({ error: addError.message }, { status: 500 });
      }
    }
  }

  // ── Return the new state so the client resets `savedFields` ─────────────
  const { data: updatedProfile } = await supabase
    .from("client_profiles")
    .select("id, full_name, email, phone")
    .eq("id", profileId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const { data: updatedKyc } = await supabase
    .from("client_profile_kyc")
    .select("*")
    .eq("client_profile_id", profileId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  let updatedRoles: Array<{ id: string; role: string; service_id: string }> = [];
  if (body.roles && body.roles.service_id) {
    const { data } = await supabase
      .from("profile_service_roles")
      .select("id, role, service_id")
      .eq("client_profile_id", profileId)
      .eq("service_id", body.roles.service_id)
      .eq("tenant_id", tenantId);
    updatedRoles = (data ?? []) as typeof updatedRoles;
  }

  // B-078 Batch 6 — one audit_log row per save event. `previous_value`
  // and `new_value` carry the diff, NOT the whole record, so the trail
  // stays compact. `detail.fields_changed` lists every dirty key the
  // client sent so reviewers can see the surface area at a glance.
  const kycPrev: Record<string, unknown> = {};
  const kycNew: Record<string, unknown> = {};
  for (const key of Object.keys(body.kyc_fields ?? {})) {
    if (!KYC_FIELD_ALLOWED.has(key)) continue;
    kycPrev[key] = (preKyc as Record<string, unknown> | null)?.[key] ?? null;
    kycNew[key] = (updatedKyc as Record<string, unknown> | null)?.[key] ?? null;
  }
  const profilePrev: Record<string, unknown> = {};
  const profileNew: Record<string, unknown> = {};
  for (const key of Object.keys(body.profile_fields ?? {})) {
    if (!PROFILE_FIELD_ALLOWED.has(key)) continue;
    profilePrev[key] =
      (profile as Record<string, unknown> | null)?.[key] ?? null;
    profileNew[key] =
      (updatedProfile as Record<string, unknown> | null)?.[key] ?? null;
  }
  const fieldsChanged = [
    ...Object.keys(kycNew),
    ...Object.keys(profileNew),
  ];
  const rolesChanged =
    body.roles &&
    ((body.roles.add?.length ?? 0) > 0 ||
      (body.roles.remove?.length ?? 0) > 0);
  if (fieldsChanged.length > 0 || rolesChanged) {
    await writeAuditLog(supabase, {
      actor_id: session.user.id,
      actor_role: "admin",
      action: "profile_kyc_updated",
      entity_type: "client_profile",
      entity_id: profileId,
      previous_value: {
        kyc_fields: kycPrev,
        profile_fields: profilePrev,
        roles: preRoles.map((r) => ({ id: r.id, role: r.role })),
      },
      new_value: {
        kyc_fields: kycNew,
        profile_fields: profileNew,
        roles: updatedRoles.map((r) => ({ id: r.id, role: r.role })),
      },
      detail: {
        service_id: body.roles?.service_id ?? null,
        fields_changed: fieldsChanged,
        roles_added: body.roles?.add?.map((a) => a.service_role_type) ?? [],
        roles_removed: body.roles?.remove?.length ?? 0,
      },
    });
  }

  return NextResponse.json({
    profile: updatedProfile ?? null,
    kyc: updatedKyc ?? null,
    roles: updatedRoles,
  });
}
