// B-111 — derive a state + optional count badge per step pill on
// `/admin/services/[id]`. Pure functions, no React, so the page can call
// them inside a `useMemo` driven by the same data the rest of the surface
// already reads (section reviews, completion %, profiles, documents).
//
// State priority (highest wins): rejected → flagged → force-reviewed →
// complete → in_review (100% but no review) → in_progress (>0 <100) →
// not_started (0%). Force-reviewed maps to amber so the override stays
// visible at a glance — the green "complete" pill is reserved for clean,
// fully-fielded sections.

import type { ApplicationSectionReview } from "@/types";

export type PillState =
  | "complete"
  | "in_review"
  | "in_progress"
  | "flagged"
  | "rejected"
  | "not_started";

export interface StepStateInput {
  /** Section review row whose `section_key` matches this step. May be null. */
  review: ApplicationSectionReview | null;
  /** Step completion percentage (0–100). */
  pct: number;
}

export function resolvePillState({ review, pct }: StepStateInput): PillState {
  if (review?.status === "rejected") return "rejected";
  if (review?.status === "flagged") return "flagged";
  // Force-reviewed renders as in_progress (amber) so the override is
  // visible at a glance, not buried under a green pill.
  if (review?.status === "reviewed" && review.force_reviewed) return "in_progress";
  if (review?.status === "reviewed" && pct >= 100) return "complete";
  if (review?.status === "reviewed") return "in_progress";
  if (pct >= 100) return "in_review";
  if (pct > 0) return "in_progress";
  return "not_started";
}

export interface StepBadgeInput {
  stepId: string;
  state: PillState;
  pct: number;
  /** People & KYC only — number of profiles whose KYC < 100%. */
  incompleteProfileCount?: number;
  /** Documents only — number of required doc types with no upload and no waiver. */
  missingDocCount?: number;
}

export function resolveCountBadge(input: StepBadgeInput): string | null {
  const { stepId, state, pct, incompleteProfileCount, missingDocCount } = input;

  // Complete + clean: no badge needed.
  if (state === "complete") return null;

  if (stepId === "step-people-kyc") {
    if (incompleteProfileCount && incompleteProfileCount > 0) {
      return `${incompleteProfileCount} incomplete`;
    }
    if (pct >= 100 && state === "in_review") return "ready";
    if (pct < 100) return `${pct}%`;
    return null;
  }

  if (stepId === "step-documents") {
    if (missingDocCount && missingDocCount > 0) {
      return `${missingDocCount} missing`;
    }
    if (pct >= 100 && state === "in_review") return "ready";
    if (pct < 100) return `${pct}%`;
    return null;
  }

  // Form steps (Company Setup / Financial / Banking) — show the raw pct
  // when actionable. "ready" surfaces when 100% but unreviewed.
  if (state === "in_review") return "ready";
  if (pct < 100) return `${pct}%`;
  return null;
}

export function pillStateTooltip(input: {
  state: PillState;
  pct: number;
  review: ApplicationSectionReview | null;
  reviewerName?: string | null;
}): string {
  const { state, pct, review, reviewerName } = input;
  const who = reviewerName ?? review?.profiles?.full_name ?? null;
  const when = review?.reviewed_at
    ? new Date(review.reviewed_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  const whoWhen = who && when ? ` on ${when} by ${who}` : when ? ` on ${when}` : "";
  switch (state) {
    case "rejected":
      return `Rejected${whoWhen}${review?.notes ? ` — ${review.notes}` : ""}`;
    case "flagged":
      return `Flagged${whoWhen}${review?.notes ? ` — ${review.notes}` : ""}`;
    case "complete":
      return `Reviewed${whoWhen}`;
    case "in_review":
      return "100% complete — awaiting review";
    case "in_progress":
      if (review?.status === "reviewed" && review.force_reviewed) {
        return `Force-reviewed${whoWhen}${review.notes ? ` — ${review.notes}` : ""}`;
      }
      return `In progress (${pct}%)`;
    case "not_started":
      return "Not started";
  }
}
