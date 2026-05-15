// B-118 — Hydrate raw review_request rows into the wire shape the page
// + components consume. Centralised so the create response, the list
// response, and the close response all return the same JSON.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HydratedReviewRequest,
  ReviewRequestReviewer,
  ReviewRequestSection,
} from "./types";
import type { ReviewSectionKey } from "./sections";

interface RawReviewRequestRow {
  id: string;
  service_id: string;
  requester_id: string;
  note: string;
  status: string;
  closed_at: string | null;
  closed_by: string | null;
  closed_reason: string | null;
  created_at: string;
}

export async function hydrateReviewRequests(
  supabase: SupabaseClient,
  rows: RawReviewRequestRow[],
): Promise<HydratedReviewRequest[]> {
  if (rows.length === 0) return [];
  const requestIds = rows.map((r) => r.id);
  const actorIds = new Set<string>();
  for (const r of rows) {
    actorIds.add(r.requester_id);
    if (r.closed_by) actorIds.add(r.closed_by);
  }

  const [{ data: reviewerRows }, { data: sectionRows }] = await Promise.all([
    supabase
      .from("review_request_reviewers")
      .select("request_id, admin_id")
      .in("request_id", requestIds),
    supabase
      .from("review_request_sections")
      .select("id, request_id, section_key, profile_id")
      .in("request_id", requestIds),
  ]);

  for (const row of (reviewerRows ?? []) as Array<{ admin_id: string }>) {
    actorIds.add(row.admin_id);
  }

  const profileLookup = new Map<string, { full_name: string | null; email: string | null }>();
  if (actorIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(actorIds));
    for (const p of (profiles ?? []) as Array<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>) {
      profileLookup.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  const reviewersByRequest = new Map<string, ReviewRequestReviewer[]>();
  for (const row of (reviewerRows ?? []) as Array<{
    request_id: string;
    admin_id: string;
  }>) {
    const list = reviewersByRequest.get(row.request_id) ?? [];
    const prof = profileLookup.get(row.admin_id);
    list.push({
      admin_id: row.admin_id,
      full_name: prof?.full_name ?? null,
      email: prof?.email ?? null,
    });
    reviewersByRequest.set(row.request_id, list);
  }

  const sectionsByRequest = new Map<string, ReviewRequestSection[]>();
  for (const row of (sectionRows ?? []) as Array<{
    id: string;
    request_id: string;
    section_key: string;
    profile_id: string | null;
  }>) {
    const list = sectionsByRequest.get(row.request_id) ?? [];
    list.push({
      id: row.id,
      section_key: row.section_key as ReviewSectionKey,
      profile_id: row.profile_id,
    });
    sectionsByRequest.set(row.request_id, list);
  }

  return rows.map((row) => {
    const requester = profileLookup.get(row.requester_id);
    const closer = row.closed_by ? profileLookup.get(row.closed_by) : undefined;
    return {
      id: row.id,
      service_id: row.service_id,
      requester_id: row.requester_id,
      requester_name: requester?.full_name ?? null,
      note: row.note,
      status: (row.status === "closed" ? "closed" : "open") as
        | "open"
        | "closed",
      closed_at: row.closed_at,
      closed_by: row.closed_by,
      closed_by_name: closer?.full_name ?? null,
      closed_reason: (row.closed_reason as
        | "reviewer_marked"
        | "requester_force_closed"
        | null) ?? null,
      created_at: row.created_at,
      reviewers: reviewersByRequest.get(row.id) ?? [],
      sections: sectionsByRequest.get(row.id) ?? [],
    };
  });
}
