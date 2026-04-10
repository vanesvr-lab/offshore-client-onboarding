import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** GET /api/me — returns the current user's userId, clientId, and role */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  return NextResponse.json({
    userId: session.user.id,
    clientId: data?.client_id ?? null,
    role: session.user.role,
  });
}
