import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface CreateClientBody {
  fullName: string;
  email: string;
  phone?: string;
  clientType: "individual" | "organisation";
  kycPreFill?: Record<string, unknown>;
  orgKycPreFill?: Record<string, unknown>;
  workflowDates?: {
    loe_sent_at?: string | null;
    invoice_sent_at?: string | null;
    payment_received_at?: string | null;
    portal_link_sent_at?: string | null;
    kyc_completed_at?: string | null;
    application_submitted_at?: string | null;
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as CreateClientBody;
  const { fullName, email, phone, clientType, kycPreFill = {}, orgKycPreFill = {}, workflowDates = {} } = body;

  if (!email?.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!clientType) {
    return NextResponse.json({ error: "clientType is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check email uniqueness
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.trim())
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Create profile (no password — invite sets it)
  const userId = crypto.randomUUID();
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    full_name: fullName?.trim() || null,
    email: email.trim(),
    phone: phone?.trim() || null,
    password_hash: null,
  });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  // Create client company
  const companyName =
    clientType === "organisation"
      ? (orgKycPreFill?.full_name as string) || fullName?.trim() || email.trim()
      : fullName?.trim() || email.trim();

  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .insert({
      company_name: companyName,
      client_type: clientType,
      ...workflowDates,
    })
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

  // Create skeleton kyc_records
  const now = new Date().toISOString();
  const individualKyc = {
    client_id: clientData.id,
    profile_id: userId,
    record_type: "individual" as const,
    full_name: fullName?.trim() || null,
    email: email.trim(),
    phone: phone?.trim() || null,
    completion_status: "incomplete" as const,
    filled_by: session.user.id,
    updated_at: now,
    ...Object.fromEntries(
      Object.entries(kycPreFill).filter(([, v]) => v !== undefined && v !== "")
    ),
  };

  const { data: indivKycData, error: kycError } = await supabase
    .from("kyc_records")
    .insert(individualKyc)
    .select()
    .single();
  if (kycError) {
    await supabase.from("profiles").delete().eq("id", userId);
    return NextResponse.json({ error: kycError.message }, { status: 500 });
  }

  // If organisation, also create org kyc record
  if (clientType === "organisation") {
    const orgKyc = {
      client_id: clientData.id,
      profile_id: null,
      record_type: "organisation" as const,
      completion_status: "incomplete" as const,
      filled_by: session.user.id,
      updated_at: now,
      ...Object.fromEntries(
        Object.entries(orgKycPreFill).filter(([, v]) => v !== undefined && v !== "")
      ),
    };
    const { error: orgKycError } = await supabase.from("kyc_records").insert(orgKyc);
    if (orgKycError) {
      return NextResponse.json({ error: orgKycError.message }, { status: 500 });
    }
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin/dashboard");
  return NextResponse.json({ success: true, clientId: clientData.id, kycRecordId: indivKycData.id });
}
