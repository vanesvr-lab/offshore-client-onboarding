import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { company_name, full_name, email, phone } = await request.json();
  if (!company_name || !full_name || !email) {
    return NextResponse.json({ error: "company_name, full_name and email are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check email not already taken
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Create profile without password — invite will set it
  const userId = crypto.randomUUID();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    full_name,
    email,
    phone: phone || null,
    password_hash: null,
  });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  // Create client company
  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .insert({ company_name })
    .select()
    .single();
  if (clientError) {
    await supabase.from("profiles").delete().eq("id", userId);
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  // Associate user as owner
  const { error: cuError } = await supabase
    .from("client_users")
    .insert({ client_id: clientData.id, user_id: userId, role: "owner" });
  if (cuError) {
    await supabase.from("profiles").delete().eq("id", userId);
    return NextResponse.json({ error: cuError.message }, { status: 500 });
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin/dashboard");
  return NextResponse.json({ success: true, clientId: clientData.id });
}
