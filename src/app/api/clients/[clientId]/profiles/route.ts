import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // Verify caller has access to this client (admin or member)
  if (session.user.role !== "admin") {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("user_id", session.user.id)
      .eq("client_id", params.clientId)
      .maybeSingle();
    if (!clientUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: profiles, error } = await supabase
    .from("kyc_records")
    .select("id, full_name, email, is_primary, profile_roles(role, application_id)")
    .eq("client_id", params.clientId)
    .order("is_primary", { ascending: false })
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ profiles: profiles ?? [] });
}
