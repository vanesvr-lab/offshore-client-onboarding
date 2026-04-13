import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    clientId: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    role: string;
    shareholdingPercentage?: number | null;
    applicationId?: string | null;
  };

  if (!body.clientId || !body.fullName || !body.role) {
    return NextResponse.json({ error: "clientId, fullName, role required" }, { status: 400 });
  }

  // Create the kyc_record (this IS the profile)
  const { data: kycRecord, error: kycErr } = await supabase
    .from("kyc_records")
    .insert({
      client_id: body.clientId,
      record_type: "individual",
      is_primary: false,
      full_name: body.fullName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      completion_status: "incomplete",
      kyc_journey_completed: false,
    })
    .select()
    .single();

  if (kycErr) return NextResponse.json({ error: kycErr.message }, { status: 500 });

  // Create the profile_roles entry
  const { data: profileRole, error: roleErr } = await supabase
    .from("profile_roles")
    .insert({
      kyc_record_id: kycRecord.id,
      application_id: body.applicationId ?? null,
      role: body.role,
      shareholding_percentage: body.shareholdingPercentage ?? null,
    })
    .select()
    .single();

  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  revalidatePath(`/admin/clients/${body.clientId}`);
  return NextResponse.json({ kycRecord, profileRole });
}
