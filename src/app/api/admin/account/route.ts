// B-101 Batch 4 — admin account: read + update full_name.
//
// GET    → { id, full_name, email, avatar_url } for the signed-in admin.
// PATCH  → { full_name } updates `users.full_name`.
//
// Auth: must be in `admin_users`. Email changes are out of scope.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, email, avatar_url")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

interface PatchBody {
  full_name?: string;
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fullName = body.full_name?.trim();
  if (!fullName) {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  }
  if (fullName.length > 200) {
    return NextResponse.json({ error: "full_name too long" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: prev } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", session.user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("users")
    .update({ full_name: fullName })
    .eq("id", session.user.id)
    .select("id, full_name, email, avatar_url")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "account_profile_updated",
    entity_type: "user",
    entity_id: session.user.id,
    previous_value: { full_name: prev?.full_name ?? null },
    new_value: { full_name: fullName },
  });

  return NextResponse.json({ data });
}
