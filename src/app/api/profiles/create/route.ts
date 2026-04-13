import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only primary clients (or admins) can create profiles
  if (session.user.role !== "admin" && session.user.is_primary === false) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Get clientId for this user
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!clientUser?.client_id) {
    return NextResponse.json({ error: "Client account not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    fullName: string;
    email?: string | null;
    phone?: string | null;
    role?: string;
  };

  if (!body.fullName?.trim()) {
    return NextResponse.json({ error: "fullName is required" }, { status: 400 });
  }

  const { data: kycRecord, error } = await supabase
    .from("kyc_records")
    .insert({
      client_id: clientUser.client_id,
      record_type: "individual",
      is_primary: false,
      full_name: body.fullName.trim(),
      email: body.email ?? null,
      phone: body.phone ?? null,
      completion_status: "incomplete",
      kyc_journey_completed: false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.role && body.role !== "primary_client") {
    await supabase.from("profile_roles").insert({
      kyc_record_id: kycRecord.id,
      role: body.role,
      application_id: null,
    });
  }

  revalidatePath("/dashboard");
  return NextResponse.json({ kycRecord });
}
