import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifyPersonAccess(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  role: string,
  appId: string,
  personId: string
): Promise<{ kycRecordId: string } | null> {
  const { data: app } = await supabase
    .from("applications")
    .select("client_id")
    .eq("id", appId)
    .single();
  if (!app) return null;

  if (role !== "admin") {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!clientUser || clientUser.client_id !== app.client_id) return null;
  }

  const { data: person } = await supabase
    .from("application_persons")
    .select("kyc_record_id")
    .eq("id", personId)
    .eq("application_id", appId)
    .single();
  if (!person) return null;

  return { kycRecordId: person.kyc_record_id };
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; personId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const access = await verifyPersonAccess(
    supabase, session.user.id, session.user.role, params.id, params.personId
  );
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as {
    role?: "director" | "shareholder" | "ubo" | "contact";
    shareholdingPercentage?: number | null;
  };

  const update: Record<string, unknown> = {};
  if (body.role !== undefined) update.role = body.role;
  if (body.shareholdingPercentage !== undefined) update.shareholding_percentage = body.shareholdingPercentage;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("application_persons")
    .update(update)
    .eq("id", params.personId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ person: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; personId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const access = await verifyPersonAccess(
    supabase, session.user.id, session.user.role, params.id, params.personId
  );
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Remove the application_persons row
  await supabase.from("application_persons").delete().eq("id", params.personId);

  // Remove the kyc_record if it's not linked to any other application
  const { data: otherLinks } = await supabase
    .from("application_persons")
    .select("id")
    .eq("kyc_record_id", access.kycRecordId)
    .limit(1);

  if (!otherLinks || otherLinks.length === 0) {
    await supabase.from("kyc_records").delete().eq("id", access.kycRecordId);
  }

  return NextResponse.json({ success: true });
}
