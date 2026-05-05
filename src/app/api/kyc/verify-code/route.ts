import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/kyc/verify-code
 *
 * Public endpoint hit by KycFillClient after the magic-link recipient
 * enters the 6-digit code from their email. On success it returns the
 * profile + KYC + documents bundle the form needs to render.
 *
 * B-056 §1.2 / §1.3 — Two production bugs were fixed here:
 *   - send-invite never wrote `kyc_record_id` (the legacy column the old
 *     code path tried to read), so every fresh code entry returned 404
 *     "Profile not found". The lookup now uses
 *     `verification_codes.client_profile_id` which IS populated.
 *   - The legacy `kyc_records` table is no longer the source of truth.
 *     We assemble a KycRecord-shape response from `client_profiles` +
 *     `client_profile_kyc` + `profile_service_roles` + `clients`.
 *   - A token whose row was superseded by a newer invite returns 410 with
 *     a distinct error message (not the generic "expired" copy) so the
 *     user knows to look at the latest email instead of contacting
 *     support.
 */
export async function POST(req: NextRequest) {
  const { token, code } = (await req.json()) as { token?: string; code?: string };

  if (!token || !code) {
    return NextResponse.json({ error: "Token and code are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: vc, error: vcErr } = await supabase
    .from("verification_codes")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();

  if (vcErr || !vc) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  // B-056 §1.2 — distinct error so the user knows to check their latest email.
  if (vc.superseded_at) {
    return NextResponse.json(
      {
        error: "Your invite was updated. Please use the latest email — the link in this one is no longer active.",
        code: "superseded",
      },
      { status: 410 }
    );
  }

  if (new Date(vc.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "This link has expired. Please ask the admin to send a new invite." },
      { status: 410 }
    );
  }

  // Re-access path: token has already been verified once, return the bundle.
  if (vc.verified_at) {
    return await returnKycData(supabase, vc.client_profile_id);
  }

  if (vc.attempts >= 5) {
    return NextResponse.json(
      { error: "Too many attempts. Please ask the admin to send a new invite." },
      { status: 429 }
    );
  }

  if (vc.code !== code.trim()) {
    await supabase
      .from("verification_codes")
      .update({ attempts: (vc.attempts ?? 0) + 1 })
      .eq("id", vc.id);

    const remaining = 4 - (vc.attempts ?? 0);
    return NextResponse.json(
      { error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` },
      { status: 401 }
    );
  }

  await supabase
    .from("verification_codes")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", vc.id);

  return await returnKycData(supabase, vc.client_profile_id);
}

async function returnKycData(
  supabase: ReturnType<typeof createAdminClient>,
  clientProfileId: string | null | undefined
) {
  if (!clientProfileId) {
    return NextResponse.json({ error: "Profile not linked to invite" }, { status: 404 });
  }

  const { data: profileRow } = await supabase
    .from("client_profiles")
    .select(
      `id, full_name, email, phone, address, record_type, client_id,
       client_profile_kyc(*),
       profile_service_roles(role)`
    )
    .eq("id", clientProfileId)
    .maybeSingle();

  if (!profileRow) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const profile = profileRow as unknown as {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    record_type: "individual" | "organisation" | null;
    client_id: string;
    client_profile_kyc: Record<string, unknown> | Record<string, unknown>[] | null;
    profile_service_roles: { role: string }[] | null;
  };

  // The Supabase JS client returns one-to-one joins as a single object on
  // some versions and an array on others — normalise.
  const kycJoin = profile.client_profile_kyc;
  const kycRow: Record<string, unknown> | null = Array.isArray(kycJoin)
    ? kycJoin[0] ?? null
    : kycJoin ?? null;

  // Compose the legacy KycRecord shape KycFillClient expects. Profile
  // identity fields (full_name / email / phone / address) live on
  // `client_profiles` post-B-009 and the rest live on
  // `client_profile_kyc`. Roles are flattened to `{ role }` objects so the
  // existing `profileRoles.some((pr) => pr.role === rdr.role)` filter on
  // the client keeps working.
  const kycRecord = {
    ...(kycRow ?? {}),
    id: (kycRow?.id as string | undefined) ?? clientProfileId,
    client_id: profile.client_id,
    client_profile_id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    record_type: profile.record_type,
    profile_roles: (profile.profile_service_roles ?? []).map((r) => ({ role: r.role })),
  };

  const { data: client } = await supabase
    .from("clients")
    .select("id, company_name, due_diligence_level")
    .eq("id", profile.client_id)
    .maybeSingle();

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("client_profile_id", clientProfileId)
    .eq("is_active", true);

  const { data: roleDocReqs } = await supabase
    .from("role_document_requirements")
    .select("*, document_types(*)");

  const { data: ddReqs } = await supabase
    .from("due_diligence_requirements")
    .select("*, document_types(*)");

  return NextResponse.json({
    verified: true,
    kycRecord,
    client: client ?? null,
    documents: documents ?? [],
    roleDocRequirements: roleDocReqs ?? [],
    ddRequirements: ddReqs ?? [],
  });
}
