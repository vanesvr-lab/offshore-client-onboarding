import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    full_name: string;
    email?: string | null;
    phone?: string | null;
    record_type?: "individual" | "organisation";
    is_representative?: boolean;
    due_diligence_level?: "sdd" | "cdd" | "edd";
  };

  if (!body.full_name?.trim()) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);
  const trimmedEmail = body.email?.trim() ?? "";

  // B-059: lookup-then-insert. If an active profile already exists for
  // (tenant_id, email), reuse it rather than creating a duplicate.
  if (trimmedEmail) {
    const { data: existing } = await supabase
      .from("client_profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("email", trimmedEmail)
      .eq("is_deleted", false)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ id: existing.id, linkedExisting: true });
    }
  }

  // Create client_profile
  const { data: profile, error: profileErr } = await supabase
    .from("client_profiles")
    .insert({
      tenant_id: tenantId,
      full_name: body.full_name.trim(),
      email: trimmedEmail || null,
      phone: body.phone?.trim() || null,
      record_type: body.record_type ?? "individual",
      is_representative: body.is_representative ?? false,
      due_diligence_level: body.due_diligence_level ?? "cdd",
    })
    .select("id")
    .single();

  if (profileErr || !profile) {
    // Race: another request created the same email-keyed profile first.
    if (profileErr?.code === "23505" && trimmedEmail) {
      const { data: refetch } = await supabase
        .from("client_profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("email", trimmedEmail)
        .eq("is_deleted", false)
        .maybeSingle();
      if (refetch) {
        return NextResponse.json({ id: refetch.id, linkedExisting: true });
      }
    }
    return NextResponse.json(
      { error: profileErr?.message ?? "Failed to create profile" },
      { status: 500 }
    );
  }

  // Create skeleton client_profile_kyc (1:1)
  if (!body.is_representative) {
    await supabase.from("client_profile_kyc").insert({
      tenant_id: tenantId,
      client_profile_id: profile.id,
      completion_status: "incomplete",
      kyc_journey_completed: false,
    });
  }

  return NextResponse.json({ id: profile.id });
}
