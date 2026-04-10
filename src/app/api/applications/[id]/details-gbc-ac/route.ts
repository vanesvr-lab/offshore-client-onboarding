import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifyAccess(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  role: string,
  appId: string
): Promise<boolean> {
  const { data: app } = await supabase
    .from("applications")
    .select("client_id")
    .eq("id", appId)
    .single();
  if (!app) return false;
  if (role === "admin") return true;
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!(clientUser && clientUser.client_id === app.client_id);
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!(await verifyAccess(supabase, session.user.id, session.user.role, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data } = await supabase
    .from("application_details_gbc_ac")
    .select("*")
    .eq("application_id", params.id)
    .maybeSingle();

  return NextResponse.json({ details: data ?? null });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!(await verifyAccess(supabase, session.user.id, session.user.role, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fields = await request.json() as Record<string, unknown>;

  const { data: existing } = await supabase
    .from("application_details_gbc_ac")
    .select("id")
    .eq("application_id", params.id)
    .maybeSingle();

  let result;
  if (existing) {
    const { data } = await supabase
      .from("application_details_gbc_ac")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("application_id", params.id)
      .select()
      .single();
    result = data;
  } else {
    const { data } = await supabase
      .from("application_details_gbc_ac")
      .insert({ application_id: params.id, ...fields })
      .select()
      .single();
    result = data;
  }

  return NextResponse.json({ details: result });
}
