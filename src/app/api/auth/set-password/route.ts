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

  if (payload.purpose !== "invite" || !payload.sub || !payload.email) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ password_hash: passwordHash })
    .eq("id", payload.sub);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ email: payload.email });
}
