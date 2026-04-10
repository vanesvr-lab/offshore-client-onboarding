import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = checkRateLimit(`register:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const { fullName, email, password, companyName } = await request.json();

  if (!fullName || !email || !password || !companyName) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check email not already taken (ignore soft-deleted accounts)
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .eq("is_deleted", false)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userId = crypto.randomUUID();

  // Create profile
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    full_name: fullName,
    email,
    password_hash: passwordHash,
  });
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // Create client company
  const clientId = crypto.randomUUID();
  const { error: clientError } = await supabase
    .from("clients")
    .insert({ id: clientId, company_name: companyName });
  if (clientError) {
    await supabase.from("profiles").delete().eq("id", userId);
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  // Associate user as owner
  const { error: cuError } = await supabase
    .from("client_users")
    .insert({ client_id: clientId, user_id: userId, role: "owner" });
  if (cuError) {
    await supabase.from("profiles").delete().eq("id", userId);
    await supabase.from("clients").delete().eq("id", clientId);
    return NextResponse.json({ error: cuError.message }, { status: 500 });
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin/dashboard");
  return NextResponse.json({ success: true });
}
