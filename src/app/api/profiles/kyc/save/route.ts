import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const body = (await request.json()) as { kycRecordId: string; fields: Record<string, unknown> };
  const { kycRecordId, fields } = body;

  if (!kycRecordId) return NextResponse.json({ error: "kycRecordId is required" }, { status: 400 });

  const supabase = createAdminClient();

  // Verify this kyc record belongs to tenant + pull the parent profile so
  // B-131/B-134 can decide whether the caller is the director themselves
  // or a delegated filing rep (matched by the FK to a rep profile).
  const { data: existing } = await supabase
    .from("client_profile_kyc")
    .select(
      "id, client_profile_id, client_profiles(id, user_id, email, filing_rep_profile_id, filing_rep:filing_rep_profile_id(id, email, is_representative))",
    )
    .eq("id", kycRecordId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // B-131/B-134 — accept either the director (matched by users.id or
  // email) or the filing rep (matched against the FK's joined
  // client_profiles.email + is_representative=true). Admin sessions can
  // always save (admins use the admin-specific endpoint normally, but
  // a stray call shouldn't 403).
  const profile = (existing as unknown as {
    client_profiles: {
      user_id: string | null;
      email: string | null;
      filing_rep_profile_id: string | null;
      filing_rep: {
        id: string;
        email: string | null;
        is_representative: boolean | null;
      } | null;
    } | null;
  }).client_profiles;
  const sessionEmail = (session.user.email ?? "").toLowerCase();
  const profileEmail = (profile?.email ?? "").toLowerCase();
  const repEmail =
    (profile?.filing_rep?.is_representative === true
      ? (profile.filing_rep.email ?? "")
      : ""
    ).toLowerCase();
  const isAdmin = session.user.role === "admin";
  const isOwner =
    !!profile?.user_id && profile.user_id === session.user.id;
  const isEmailOwner =
    !!profileEmail && profileEmail === sessionEmail;
  const isFilingRep = !!repEmail && repEmail === sessionEmail;
  if (!isAdmin && !isOwner && !isEmailOwner && !isFilingRep) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Clean date/boolean fields
  const DATE_FIELDS = ["date_of_birth", "passport_expiry", "date_of_incorporation"];
  const BOOLEAN_FIELDS = ["legal_issues_declared", "is_pep", "sanctions_checked", "adverse_media_checked", "pep_verified"];

  // Fields that exist on client_profiles (saved separately)
  const PROFILE_FIELDS = ["email", "phone", "full_name", "address"];

  // Fields that must never be written to either table
  const EXCLUDED_FIELDS = ["client_id", "profile_id",
    "record_type", "is_primary", "due_diligence_level", "invite_sent_at", "invite_sent_by",
    "filled_by", "id", "tenant_id", "created_at", "updated_at", "client_profile_id"];

  const cleanedFields: Record<string, unknown> = {};
  const profileUpdates: Record<string, unknown> = {};

  // B-049 — track whether any structured residential-address field is in
  // this patch. If so, we re-derive the legacy `address` column from the
  // resulting row so the submit validator (which still reads `address`)
  // stays in sync with what the wizard collected.
  const STRUCTURED_ADDRESS_FIELDS = [
    "address_line_1",
    "address_line_2",
    "address_city",
    "address_state",
    "address_postal_code",
    "address_country",
  ];
  let structuredAddressTouched = false;

  for (const [key, value] of Object.entries(fields)) {
    if (EXCLUDED_FIELDS.includes(key)) continue;
    if (PROFILE_FIELDS.includes(key)) {
      if (value !== undefined && value !== null && value !== "") {
        profileUpdates[key] = value;
      }
      continue;
    }
    if (STRUCTURED_ADDRESS_FIELDS.includes(key)) structuredAddressTouched = true;
    if (DATE_FIELDS.includes(key) && (value === "" || value === null)) {
      cleanedFields[key] = null;
    } else if (BOOLEAN_FIELDS.includes(key) && value === "") {
      cleanedFields[key] = null;
    } else {
      cleanedFields[key] = value;
    }
  }

  const { data: updated, error } = await supabase
    .from("client_profile_kyc")
    .update({
      ...cleanedFields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", kycRecordId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep the legacy `address` text on client_profiles in sync with the
  // structured fields whenever they're written. This means the existing
  // submit validator + admin views that read the single-line address keep
  // working without changes.
  if (structuredAddressTouched && updated) {
    const u = updated as Record<string, unknown>;
    const parts = [
      u.address_line_1,
      u.address_line_2,
      u.address_city,
      u.address_state,
      u.address_postal_code,
      u.address_country,
    ]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0);
    if (parts.length > 0) {
      profileUpdates["address"] = parts.join(", ");
    }
  }

  // Update email/phone on client_profiles if provided
  if (Object.keys(profileUpdates).length > 0) {
    await supabase
      .from("client_profiles")
      .update(profileUpdates)
      .eq("id", existing.client_profile_id)
      .eq("tenant_id", tenantId);
  }

  // B-131 — capture rep-driven KYC saves in audit_log so the paper
  // trail distinguishes "filed by the director themselves" from
  // "filed by their representative". Self-driven saves remain silent
  // (auto-save fires per field and would flood the log).
  if (isFilingRep && !isOwner && !isEmailOwner) {
    await writeAuditLog(supabase, {
      actor_id: session.user.id,
      actor_role: "client",
      actor_name: session.user.name ?? session.user.email ?? "Filing rep",
      action: "profile_kyc_saved_by_rep",
      entity_type: "client_profile_kyc",
      entity_id: kycRecordId,
      previous_value: null,
      new_value: {
        fields_touched: Object.keys(cleanedFields),
        profile_fields_touched: Object.keys(profileUpdates),
        client_profile_id: existing.client_profile_id,
      },
    });
  }

  return NextResponse.json({ record: updated });
}
