// B-118 — Peer/Manager review requests: create + list.
//
// POST  creates a request, fans out emails (Resend + logCommunication),
//       writes an audit row, and returns the hydrated request shape.
// GET   returns all open requests + the 10 most-recent closed requests
//       for this service, hydrated with reviewer names.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { getTenantBrand } from "@/lib/tenant-brand";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { hydrateReviewRequests } from "@/lib/review-requests/hydrate";
import {
  isReviewSectionKey,
  PEOPLE_KYC_PROFILE_KEY,
} from "@/lib/review-requests/sections";
import { sendReviewRequestCreatedEmails } from "@/lib/review-requests/emails";
import type {
  CreateReviewRequestBody,
  HydratedReviewRequest,
} from "@/lib/review-requests/types";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);
  const serviceId = params.id;

  const body = (await request.json().catch(() => null)) as
    | CreateReviewRequestBody
    | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const note = (body.note ?? "").trim();
  if (note.length === 0) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }
  const reviewerIds = Array.isArray(body.reviewerIds)
    ? Array.from(new Set(body.reviewerIds.filter((x) => typeof x === "string")))
    : [];
  if (reviewerIds.length === 0) {
    return NextResponse.json(
      { error: "At least one reviewer is required" },
      { status: 400 },
    );
  }
  if (reviewerIds.includes(session.user.id)) {
    return NextResponse.json(
      { error: "You can't request review from yourself" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.sections) || body.sections.length === 0) {
    return NextResponse.json(
      { error: "At least one section is required" },
      { status: 400 },
    );
  }
  for (const s of body.sections) {
    if (!s || typeof s.section_key !== "string" || !isReviewSectionKey(s.section_key)) {
      return NextResponse.json(
        { error: `Invalid section key: ${String(s?.section_key)}` },
        { status: 400 },
      );
    }
    if (s.section_key === PEOPLE_KYC_PROFILE_KEY) {
      if (!s.profile_id) {
        return NextResponse.json(
          { error: "people_kyc_profile section requires profile_id" },
          { status: 400 },
        );
      }
    } else if (s.profile_id) {
      return NextResponse.json(
        {
          error: `Top-level section ${s.section_key} must not carry profile_id`,
        },
        { status: 400 },
      );
    }
  }

  // Verify service belongs to tenant + pull service_number for the emails.
  const { data: serviceRow, error: serviceErr } = await supabase
    .from("services")
    .select("id, service_number, tenant_id")
    .eq("id", serviceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (serviceErr || !serviceRow) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Validate reviewers are real admins (deny silently otherwise).
  const { data: adminRows } = await supabase
    .from("admin_users")
    .select("user_id")
    .in("user_id", reviewerIds);
  const validAdminIds = new Set(
    (adminRows ?? []).map((r: { user_id: string }) => r.user_id),
  );
  const filteredReviewerIds = reviewerIds.filter((id) => validAdminIds.has(id));
  if (filteredReviewerIds.length === 0) {
    return NextResponse.json(
      { error: "No valid admin reviewers in the request" },
      { status: 400 },
    );
  }

  // Validate any referenced profiles belong to this tenant.
  const profileIdsInBody = Array.from(
    new Set(
      body.sections
        .map((s) => s.profile_id)
        .filter((id): id is string => typeof id === "string" && !!id),
    ),
  );
  let profilesById = new Map<
    string,
    { id: string; full_name: string | null }
  >();
  if (profileIdsInBody.length > 0) {
    const { data: profRows } = await supabase
      .from("client_profiles")
      .select("id, full_name, tenant_id")
      .in("id", profileIdsInBody)
      .eq("tenant_id", tenantId);
    profilesById = new Map(
      (profRows ?? []).map((p: { id: string; full_name: string | null }) => [
        p.id,
        { id: p.id, full_name: p.full_name },
      ]),
    );
    for (const pid of profileIdsInBody) {
      if (!profilesById.has(pid)) {
        return NextResponse.json(
          { error: `Profile not in this tenant: ${pid}` },
          { status: 400 },
        );
      }
    }
  }

  // Insert the request row + linked reviewers + sections.
  const { data: inserted, error: insertErr } = await supabase
    .from("review_requests")
    .insert({
      tenant_id: tenantId,
      service_id: serviceId,
      requester_id: session.user.id,
      note,
    })
    .select(
      "id, service_id, requester_id, note, status, closed_at, closed_by, closed_reason, created_at",
    )
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create request" },
      { status: 500 },
    );
  }
  const requestId = inserted.id as string;

  const { error: reviewersErr } = await supabase
    .from("review_request_reviewers")
    .insert(
      filteredReviewerIds.map((admin_id) => ({
        request_id: requestId,
        admin_id,
      })),
    );
  if (reviewersErr) {
    await supabase.from("review_requests").delete().eq("id", requestId);
    return NextResponse.json(
      { error: `Failed to attach reviewers: ${reviewersErr.message}` },
      { status: 500 },
    );
  }

  const { error: sectionsErr } = await supabase
    .from("review_request_sections")
    .insert(
      body.sections.map((s) => ({
        request_id: requestId,
        section_key: s.section_key,
        profile_id:
          s.section_key === PEOPLE_KYC_PROFILE_KEY ? s.profile_id ?? null : null,
      })),
    );
  if (sectionsErr) {
    await supabase.from("review_requests").delete().eq("id", requestId);
    return NextResponse.json(
      { error: `Failed to attach sections: ${sectionsErr.message}` },
      { status: 500 },
    );
  }

  // Hydrate so the response has reviewer names + section list.
  const [hydrated] = await hydrateReviewRequests(supabase, [inserted]);

  // Resolve requester email for the closed-by-reviewer reply-emails later.
  // B-142 — read from `users` (post-B-127 auth source of truth).
  const { data: requesterProfile } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", session.user.id)
    .maybeSingle();
  const requesterName =
    requesterProfile?.full_name ??
    session.user.name ??
    session.user.email ??
    "An admin";

  // Send emails + log communications.
  const brand = await getTenantBrand(supabase, tenantId);
  const commRows = await sendReviewRequestCreatedEmails({
    supabase,
    tenantId,
    brand,
    serviceId,
    serviceNumber: serviceRow.service_number ?? null,
    requesterId: session.user.id,
    requesterName,
    requesterEmail: requesterProfile?.email ?? null,
    reviewers: hydrated.reviewers,
    sections: hydrated.sections,
    profilesById: new Map(
      Array.from(profilesById.entries()).map(([k, v]) => [
        k,
        { id: v.id, full_name: v.full_name },
      ]),
    ),
    note,
    requestId,
  });

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: requesterName,
    action: "review_request_created",
    entity_type: "review_request",
    entity_id: requestId,
    previous_value: null,
    new_value: {
      reviewer_ids: filteredReviewerIds,
      section_keys: body.sections.map((s) => ({
        section_key: s.section_key,
        profile_id: s.profile_id ?? null,
      })),
      note_preview: note.slice(0, 200),
    },
    detail: {
      service_id: serviceId,
      service_number: serviceRow.service_number ?? null,
    },
  });

  return NextResponse.json({
    request: hydrated as HydratedReviewRequest,
    communications: commRows,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: openRows } = await supabase
    .from("review_requests")
    .select(
      "id, service_id, requester_id, note, status, closed_at, closed_by, closed_reason, created_at",
    )
    .eq("service_id", params.id)
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const { data: closedRows } = await supabase
    .from("review_requests")
    .select(
      "id, service_id, requester_id, note, status, closed_at, closed_by, closed_reason, created_at",
    )
    .eq("service_id", params.id)
    .eq("tenant_id", tenantId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(10);

  const rows = [
    ...((openRows ?? []) as Parameters<typeof hydrateReviewRequests>[1]),
    ...((closedRows ?? []) as Parameters<typeof hydrateReviewRequests>[1]),
  ];
  const requests = await hydrateReviewRequests(supabase, rows);
  return NextResponse.json({ requests });
}
