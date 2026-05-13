// B-101 Batch 4 — admin account: change password.
//
// POST { current_password, new_password } → verify current, hash new,
// persist on both `users` and `profiles` tables (the latter retained for
// backward compat with the legacy auth path, mirroring `set-password`
// and `register`).
//
// Auth: must be in `admin_users`. Min 8 chars on the new password
// (matches `set-password`).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

interface PasswordBody {
  current_password?: string;
  new_password?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: PasswordBody;
  try {
    body = (await request.json()) as PasswordBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const current = body.current_password ?? "";
  const next = body.new_password ?? "";
  if (!current) {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 });
  }
  if (!next || next.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("users")
    .select("password_hash")
    .eq("id", session.user.id)
    .maybeSingle();
  if (!row?.password_hash) {
    return NextResponse.json({ error: "Account has no password set" }, { status: 400 });
  }

  const ok = await bcrypt.compare(current, row.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(next, 12);
  const { error } = await supabase
    .from("users")
    .update({ password_hash: newHash })
    .eq("id", session.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Backward-compat write to the legacy `profiles` table; matches
  // `set-password` + `register`.
  await supabase
    .from("profiles")
    .update({ password_hash: newHash })
    .eq("id", session.user.id);

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "account_password_changed",
    entity_type: "user",
    entity_id: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
