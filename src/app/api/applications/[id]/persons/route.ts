import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifyAccess(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  role: string,
  appId: string
): Promise<{ clientId: string } | null> {
  const { data: app } = await supabase
    .from("applications")
    .select("client_id")
    .eq("id", appId)
    .single();
  if (!app) return null;
  if (role === "admin") return { clientId: app.client_id };
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!clientUser || clientUser.client_id !== app.client_id) return null;
  return { clientId: app.client_id };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const access = await verifyAccess(supabase, session.user.id, session.user.role, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: persons } = await supabase
    .from("application_persons")
    .select(`
      id, role, shareholding_percentage, created_at,
      kyc_records!kyc_record_id(*)
    `)
    .eq("application_id", params.id)
    .order("created_at");

  // Fetch document counts per kyc_record_id
  const kycIds = (persons ?? [])
    .map((p) => (p.kyc_records as unknown as { id: string } | null)?.id)
    .filter(Boolean) as string[];

  const docCounts: Record<string, number> = {};
  if (kycIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("kyc_record_id")
      .in("kyc_record_id", kycIds)
      .eq("is_active", true);
    if (docs) {
      for (const d of docs) {
        if (d.kyc_record_id) {
          docCounts[d.kyc_record_id] = (docCounts[d.kyc_record_id] ?? 0) + 1;
        }
      }
    }
  }

  // Attach doc_count to each person
  const personsWithDocs = (persons ?? []).map((p) => {
    const kycId = (p.kyc_records as unknown as { id: string } | null)?.id;
    return { ...p, doc_count: kycId ? (docCounts[kycId] ?? 0) : 0 };
  });

  return NextResponse.json({ persons: personsWithDocs });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const access = await verifyAccess(supabase, session.user.id, session.user.role, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { role, kycFields, shareholdingPercentage, existingKycRecordId } = await request.json() as {
    role: "director" | "shareholder" | "ubo" | "contact";
    kycFields?: Record<string, unknown>;
    shareholdingPercentage?: number;
    existingKycRecordId?: string;
  };

  if (!role) return NextResponse.json({ error: "role is required" }, { status: 400 });

  let kycRecord: Record<string, unknown>;

  if (existingKycRecordId) {
    // Reuse existing kyc_record — verify it belongs to this client
    const { data: existing, error: fetchErr } = await supabase
      .from("kyc_records")
      .select("*")
      .eq("id", existingKycRecordId)
      .eq("client_id", access.clientId)
      .single();
    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    kycRecord = existing as Record<string, unknown>;
  } else {
    // Create a new kyc_record for this person
    const { data: created, error: kycError } = await supabase
      .from("kyc_records")
      .insert({
        client_id: access.clientId,
        record_type: "individual",
        completion_status: "incomplete",
        kyc_journey_completed: false,
        ...(kycFields ?? {}),
      })
      .select()
      .single();
    if (kycError || !created) {
      return NextResponse.json({ error: "Failed to create KYC record" }, { status: 500 });
    }
    kycRecord = created as Record<string, unknown>;
  }

  // Create application_persons row
  const { data: person, error: personError } = await supabase
    .from("application_persons")
    .insert({
      application_id: params.id,
      kyc_record_id: kycRecord.id as string,
      role,
      shareholding_percentage: shareholdingPercentage ?? null,
    })
    .select()
    .single();

  if (personError || !person) {
    return NextResponse.json({ error: "Failed to create person record" }, { status: 500 });
  }

  // Also create profile_roles entry for the new data model
  await supabase
    .from("profile_roles")
    .upsert({
      kyc_record_id: kycRecord.id as string,
      application_id: params.id,
      role,
      shareholding_percentage: shareholdingPercentage ?? null,
    }, { onConflict: "kyc_record_id,application_id,role" });

  return NextResponse.json({ person: { ...person, kyc_records: kycRecord, doc_count: 0 } });
}
