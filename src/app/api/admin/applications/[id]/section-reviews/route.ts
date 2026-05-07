import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import type { ApplicationSectionReview, SectionReviewStatus } from "@/types";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const sectionKey = searchParams.get("section_key");

  const supabase = createAdminClient();
  let query = supabase
    .from("application_section_reviews")
    .select("*, profiles:reviewed_by(full_name)")
    .eq("application_id", params.id)
    .order("reviewed_at", { ascending: false });

  if (sectionKey) query = query.eq("section_key", sectionKey);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: (data ?? []) as unknown as ApplicationSectionReview[] });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { section_key?: string; status?: SectionReviewStatus; notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sectionKey = body.section_key?.trim();
  const status = body.status;
  if (!sectionKey) {
    return NextResponse.json({ error: "section_key is required" }, { status: 400 });
  }
  if (status !== "approved" && status !== "flagged" && status !== "rejected") {
    return NextResponse.json({ error: "status must be approved | flagged | rejected" }, { status: 400 });
  }
  const notes = body.notes?.trim() || null;
  if ((status === "rejected" || status === "flagged") && !notes) {
    return NextResponse.json({ error: "Notes are required when flagging or rejecting" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("application_section_reviews")
    .insert({
      application_id: params.id,
      section_key: sectionKey,
      status,
      notes,
      reviewed_by: session.user.id,
    })
    .select("*, profiles:reviewed_by(full_name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // B-077 Batch 7 — record the section review in the audit_log so the
  // service-detail audit panel surfaces it. `params.id` is the service id
  // (column name is misleading per tech-debt #26 — application_id stores
  // service ids on the modern path).
  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    action: "section_review_saved",
    entity_type: "service",
    entity_id: params.id,
    new_value: { section_key: sectionKey, status, notes },
  });

  return NextResponse.json({ data: data as unknown as ApplicationSectionReview });
}
