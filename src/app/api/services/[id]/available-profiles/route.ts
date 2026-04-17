import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: serviceId } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const supabase = createAdminClient();

  // Get profile IDs already linked to this service
  const { data: linked } = await supabase
    .from("profile_service_roles")
    .select("client_profile_id")
    .eq("service_id", serviceId)
    .eq("tenant_id", tenantId);

  const linkedIds = (linked ?? []).map((r) => r.client_profile_id);

  // Get all tenant profiles not already linked
  let query = supabase
    .from("client_profiles")
    .select("id, full_name, email")
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false);

  if (linkedIds.length > 0) {
    query = query.not("id", "in", `(${linkedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
