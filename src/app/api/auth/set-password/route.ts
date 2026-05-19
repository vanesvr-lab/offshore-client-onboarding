import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { token, password } = await request.json();

  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  let payload: { sub?: string; email?: string; purpose?: string };
  try {
    const result = await jwtVerify(token, secret);
    payload = result.payload as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 400 });
  }

  // B-127 — admin invites mint JWTs with purpose=admin_invite. Treated
  // the same as the legacy `invite` / `profile_invite` paths for the
  // password write; the recipient's role is determined by their
  // membership in `admin_users` (no client_profiles row), so the
  // post-set-password redirect lands them on the admin portal.
  const validPurposes = ["invite", "profile_invite", "admin_invite"];
  if (!validPurposes.includes(payload.purpose ?? "") || !payload.sub || !payload.email) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const passwordHash = await bcrypt.hash(password, 12);

  // Write to new users table (primary) + old profiles table (backward compat)
  const { error } = await supabase
    .from("users")
    .update({ password_hash: passwordHash })
    .eq("id", payload.sub);

  // Also update old profiles table for backward compatibility
  await supabase
    .from("profiles")
    .update({ password_hash: passwordHash })
    .eq("id", payload.sub);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    email: payload.email,
    isProfileInvite: payload.purpose === "profile_invite",
  });
}
