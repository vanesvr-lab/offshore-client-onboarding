// B-130 — Reviewer inbox. Lists every open peer/manager review request
// where the current admin is invited as a reviewer. The sidebar badge
// (loaded from the same query in the admin layout) deep-links here.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SECTION_LABELS,
  PEOPLE_KYC_PROFILE_KEY,
  isTopLevelSectionKey,
} from "@/lib/review-requests/sections";
import { ReviewsInbox, type ReviewsInboxRow } from "@/components/admin/ReviewsInbox";

export const dynamic = "force-dynamic";

interface RawReviewerRow {
  request_id: string;
  review_requests: {
    id: string;
    service_id: string;
    note: string;
    created_at: string;
    status: string;
    requester:
      | { id: string; full_name: string | null; email: string | null }
      | null;
    services: {
      id: string;
      service_number: string | null;
      service_templates: { name: string } | null;
    } | null;
    review_request_sections: Array<{
      section_key: string;
      profile_id: string | null;
    }> | null;
  } | null;
}

function sectionSummary(
  sections: Array<{ section_key: string; profile_id: string | null }>,
  profileNamesById: Map<string, string>,
): { first: string; count: number; full: string[] } {
  if (!sections || sections.length === 0) {
    return { first: "(no sections)", count: 0, full: [] };
  }
  const labels = sections.map((s) => {
    if (s.section_key === PEOPLE_KYC_PROFILE_KEY) {
      const name = s.profile_id
        ? (profileNamesById.get(s.profile_id) ?? "Unknown profile")
        : "Unknown profile";
      return `People & KYC — ${name}`;
    }
    if (isTopLevelSectionKey(s.section_key)) {
      return SECTION_LABELS[s.section_key];
    }
    return s.section_key;
  });
  return { first: labels[0], count: labels.length, full: labels };
}

export default async function ReviewsInboxPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // review_request_reviewers (admin_id, request_id) is the easiest
  // anchor to filter on. Nested select pulls the rest in one round-trip.
  const { data: rawReviewerRows } = await supabase
    .from("review_request_reviewers")
    .select(
      `
      request_id,
      review_requests!inner(
        id, service_id, note, created_at, status,
        requester:users!review_requests_requester_id_fkey(id, full_name, email),
        services!inner(id, service_number, service_templates(name)),
        review_request_sections(section_key, profile_id)
      )
    `,
    )
    .eq("admin_id", session.user.id)
    .eq("review_requests.tenant_id", tenantId)
    .eq("review_requests.status", "open");

  const reviewerRows =
    (rawReviewerRows as unknown as RawReviewerRow[] | null) ?? [];

  // Collect profile ids referenced by people_kyc_profile sections so we
  // can resolve their display names in one extra query.
  const profileIds = new Set<string>();
  for (const r of reviewerRows) {
    const sections = r.review_requests?.review_request_sections ?? [];
    for (const s of sections) {
      if (s.section_key === PEOPLE_KYC_PROFILE_KEY && s.profile_id) {
        profileIds.add(s.profile_id);
      }
    }
  }
  const profileNamesById = new Map<string, string>();
  if (profileIds.size > 0) {
    const { data: profileRows } = await supabase
      .from("client_profiles")
      .select("id, full_name")
      .in("id", Array.from(profileIds));
    for (const p of (profileRows ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      profileNamesById.set(p.id, p.full_name ?? "Unnamed profile");
    }
  }

  const rows: ReviewsInboxRow[] = reviewerRows
    .map((r) => r.review_requests)
    .filter((rr): rr is NonNullable<RawReviewerRow["review_requests"]> => !!rr)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .map((rr) => {
      const sections = rr.review_request_sections ?? [];
      const sectionInfo = sectionSummary(sections, profileNamesById);
      return {
        id: rr.id,
        service_id: rr.service_id,
        service_number: rr.services?.service_number ?? null,
        template_name: rr.services?.service_templates?.name ?? null,
        requester_name:
          rr.requester?.full_name ?? rr.requester?.email ?? "Unknown",
        note: rr.note,
        created_at: rr.created_at,
        section_first: sectionInfo.first,
        section_count: sectionInfo.count,
        section_full: sectionInfo.full,
      };
    });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy flex items-center gap-3">
          Reviews assigned to me
          <span className="text-base font-medium text-gray-400">
            ({rows.length})
          </span>
        </h1>
        <p className="text-gray-500 mt-1">
          Peer or manager review requests waiting on your sign-off.
        </p>
      </div>
      <ReviewsInbox rows={rows} />
    </div>
  );
}
