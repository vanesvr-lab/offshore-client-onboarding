import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/** POST /api/admin/profiles/[id]/requirement-overrides — Waive a DD requirement for a profile */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = getTenantId(session);
  const { id: profileId } = await params;

  // Verify profile belongs to this tenant
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("client_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("tenant_id", tenantId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = (await request.json()) as { requirement_id: string; reason?: string };
  if (!body.requirement_id) {
    return NextResponse.json({ error: "requirement_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profile_requirement_overrides")
    .upsert(
      {
        tenant_id: tenantId,
        client_profile_id: profileId,
        requirement_id: body.requirement_id,
        is_required: false,
        reason: body.reason?.trim() || null,
        overridden_by: session.user.id,
        overridden_at: new Date().toISOString(),
      },
      { onConflict: "client_profile_id,requirement_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ override: data });
}
