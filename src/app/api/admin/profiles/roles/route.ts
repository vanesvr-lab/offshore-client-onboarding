import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import type { ProfileRole } from "@/types";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const kycRecordId = searchParams.get("kycRecordId");
  if (!kycRecordId) return NextResponse.json({ error: "kycRecordId required" }, { status: 400 });

  const { data, error } = await supabase
    .from("profile_roles")
    .select("*")
    .eq("kyc_record_id", kycRecordId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roles: (data ?? []) as ProfileRole[] });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as {
    kycRecordId: string;
    applicationId?: string | null;
    role: string;
    shareholdingPercentage?: number | null;
  };

  if (!body.kycRecordId || !body.role) {
    return NextResponse.json({ error: "kycRecordId and role required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("profile_roles")
    .insert({
      kyc_record_id: body.kycRecordId,
      application_id: body.applicationId ?? null,
      role: body.role,
      shareholding_percentage: body.shareholdingPercentage ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "profile_role_added",
    entity_type: "client_profile",
    entity_id: body.kycRecordId,
    previous_value: null,
    new_value: {
      role_id: (data as ProfileRole).id,
      role: body.role,
      shareholding_percentage: body.shareholdingPercentage ?? null,
    },
    detail: { role: body.role },
  });

  return NextResponse.json({ role: data as ProfileRole });
}
