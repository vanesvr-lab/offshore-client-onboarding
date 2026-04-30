import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/**
 * Returns every tenant profile (not just those unlinked from this service),
 * along with all of its existing roles across every service in the tenant.
 *
 * Shape:
 *   [{
 *     id, full_name, email, phone, record_type,
 *     roles: [{ service_id, role, shareholding_percentage }]
 *   }]
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: serviceId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const supabase = createAdminClient();

  void serviceId; // service-scoped auth is enforced by the per-service POST endpoint

  const { data, error } = await supabase
    .from("client_profiles")
    .select(
      "id, full_name, email, phone, record_type, profile_service_roles(service_id, role, shareholding_percentage)"
    )
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .order("full_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    record_type: "individual" | "organisation";
    profile_service_roles: { service_id: string; role: string; shareholding_percentage: number | null }[] | null;
  };

  const result = ((data ?? []) as unknown as Row[]).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    phone: p.phone,
    record_type: p.record_type,
    roles: p.profile_service_roles ?? [],
  }));

  return NextResponse.json(result);
}
