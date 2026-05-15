// B-118 — Close a peer/manager review request.
//
// Two close paths:
//   - reviewer_marked: caller is in review_request_reviewers
//   - requester_force_closed: caller is the requester
//
// On success, emails fire to the counter-party (requester if reviewer
// closed; all reviewers if requester closed) and audit_log captures the
// state change.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { hydrateReviewRequests } from "@/lib/review-requests/hydrate";
import {
  sendReviewRequestClosedByReviewerEmail,
  sendReviewRequestClosedByRequesterEmails,
} from "@/lib/review-requests/emails";
import type {
  CloseReviewRequestBody,
  HydratedReviewRequest,
} from "@/lib/review-requests/types";

export async function POST(
  request: Request,
  { params }: { params: { id: string; requestId: string } },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);
  const serviceId = params.id;
  const requestId = params.requestId;

  const body = (await request.json().catch(() => null)) as
    | CloseReviewRequestBody
    | null;
  const reason = body?.reason;
  if (reason !== "reviewer_marked" && reason !== "requester_force_closed") {
    return NextResponse.json(
      { error: "reason must be reviewer_marked or requester_force_closed" },
      { status: 400 },
    );
  }

  // Verify the request exists, is open, belongs to this service + tenant.
  const { data: req, error: fetchErr } = await supabase
    .from("review_requests")
    .select(
      "id, service_id, requester_id, note, status, closed_at, closed_by, closed_reason, created_at, tenant_id",
    )
    .eq("id", requestId)
    .eq("service_id", serviceId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (fetchErr || !req) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (req.status !== "open") {
    return NextResponse.json(
      { error: "Request is already closed" },
      { status: 409 },
    );
  }

  // Authorization branches.
  if (reason === "requester_force_closed") {
    if (req.requester_id !== session.user.id) {
      return NextResponse.json(
        { error: "Only the requester can force-close this request" },
        { status: 403 },
      );
    }
  } else {
    // reviewer_marked — caller must be in review_request_reviewers
    const { data: reviewerRow } = await supabase
      .from("review_request_reviewers")
      .select("admin_id")
      .eq("request_id", requestId)
      .eq("admin_id", session.user.id)
      .maybeSingle();
    if (!reviewerRow) {
      return NextResponse.json(
        { error: "You are not an invited reviewer on this request" },
        { status: 403 },
      );
    }
  }

  const closedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("review_requests")
    .update({
      status: "closed",
      closed_at: closedAt,
      closed_by: session.user.id,
      closed_reason: reason,
      updated_at: closedAt,
    })
    .eq("id", requestId)
    .eq("status", "open") // optimistic-lock guard
    .select(
      "id, service_id, requester_id, note, status, closed_at, closed_by, closed_reason, created_at",
    )
    .single();
  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Race: request closed between checks" },
      { status: 409 },
    );
  }

  const [hydrated] = await hydrateReviewRequests(supabase, [updated]);

  // Look up service number + counter-party emails.
  const { data: serviceRow } = await supabase
    .from("services")
    .select("service_number")
    .eq("id", serviceId)
    .maybeSingle();
  const { data: requesterProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", hydrated.requester_id)
    .maybeSingle();
  const requesterName = requesterProfile?.full_name ?? "the requester";

  const actorName =
    session.user.name ??
    session.user.email ??
    "an admin";

  const commRows: Record<string, unknown>[] = [];
  if (reason === "reviewer_marked") {
    const commRow = await sendReviewRequestClosedByReviewerEmail({
      supabase,
      tenantId,
      serviceId,
      serviceNumber: serviceRow?.service_number ?? null,
      requestId,
      reviewerId: session.user.id,
      reviewerName: actorName,
      requesterEmail: requesterProfile?.email ?? null,
      requesterName,
    });
    if (commRow) commRows.push(commRow);
  } else {
    const reviewersWithEmail = hydrated.reviewers.filter((r) => !!r.email);
    const rows = await sendReviewRequestClosedByRequesterEmails({
      supabase,
      tenantId,
      serviceId,
      serviceNumber: serviceRow?.service_number ?? null,
      requestId,
      requesterId: session.user.id,
      requesterName: actorName,
      reviewers: reviewersWithEmail,
    });
    commRows.push(...rows);
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: actorName,
    action: "review_request_closed",
    entity_type: "review_request",
    entity_id: requestId,
    previous_value: { status: "open" },
    new_value: {
      status: "closed",
      closed_reason: reason,
    },
    detail: {
      service_id: serviceId,
      service_number: serviceRow?.service_number ?? null,
    },
  });

  return NextResponse.json({
    request: hydrated as HydratedReviewRequest,
    communications: commRows,
  });
}
