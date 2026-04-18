import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

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
  };

  if (!body.role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  if (!body.client_profile_id && !body.full_name) {
    return NextResponse.json({ error: "client_profile_id or full_name is required" }, { status: 400 });
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
    const { data: profile, error: profileError } = await supabase
      .from("client_profiles")
      .insert({
        tenant_id: tenantId,
        user_id: null,
        record_type: body.record_type ?? "individual",
        is_representative: false,
        full_name: body.full_name,
        email: body.email ?? null,
        due_diligence_level: "sdd",
      })
      .select("id")
      .single();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    // Create KYC record
    await supabase.from("client_profile_kyc").insert({
      tenant_id: tenantId,
      client_profile_id: profile.id,
      completion_status: "incomplete",
      kyc_journey_completed: false,
      sanctions_checked: false,
      adverse_media_checked: false,
      pep_verified: false,
    });

    profileId = profile.id;
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

  return NextResponse.json({ id: data.id, client_profile_id: profileId });
}
