import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/me — returns the current user's clientId (if they are a client) */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  return NextResponse.json({ clientId: data?.client_id ?? null });
}
