import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: serviceId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  // Verify caller has can_manage for this service
  const { data: roleCheck } = await supabase
    .from("profile_service_roles")
    .select("id")
    .eq("service_id", serviceId)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  if (!roleCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    client_profile_id?: string;
    role: string;
    full_name?: string;
    email?: string;
    phone?: string;
    record_type?: "individual" | "organisation";
    shareholding_percentage?: number;
  };

  const { role, shareholding_percentage } = body;

  if (body.client_profile_id) {
    // Link existing profile
    const { data, error } = await supabase
      .from("profile_service_roles")
      .insert({
        tenant_id: tenantId,
        client_profile_id: body.client_profile_id,
        service_id: serviceId,
        role,
        can_manage: false,
        shareholding_percentage: shareholding_percentage ?? null,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  }

  if (body.full_name) {
    // Create new profile + KYC row + role
    const { data: profile, error: profileError } = await supabase
      .from("client_profiles")
      .insert({
        tenant_id: tenantId,
        user_id: null,
        record_type: body.record_type ?? "individual",
        is_representative: false,
        full_name: body.full_name,
        email: body.email ?? null,
        phone: body.phone ?? null,
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

    // Create role
    const { data: roleRow, error: roleError } = await supabase
      .from("profile_service_roles")
      .insert({
        tenant_id: tenantId,
        client_profile_id: profile.id,
        service_id: serviceId,
        role,
        can_manage: false,
        shareholding_percentage: shareholding_percentage ?? null,
      })
      .select("id")
      .single();
    if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 });
    return NextResponse.json({ id: roleRow.id, profileId: profile.id });
  }

  return NextResponse.json({ error: "client_profile_id or full_name required" }, { status: 400 });
}
