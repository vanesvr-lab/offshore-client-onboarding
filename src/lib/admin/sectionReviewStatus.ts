// B-098 — Section review status constants. Clicking the Review button
// on an admin section card sets the section to `reviewed`; flag/reject
// remain as before. Renamed from `approved` so future renames touch
// one file. Imported by the badge, panel, button, API route, and any
// aggregate logic that needs a string-literal compare.

export const SECTION_REVIEW_STATUS = {
  REVIEWED: "reviewed",
  FLAGGED: "flagged",
  REJECTED: "rejected",
} as const;

export type SectionReviewStatus =
  (typeof SECTION_REVIEW_STATUS)[keyof typeof SECTION_REVIEW_STATUS];

export const SECTION_REVIEW_STATUS_VALUES: readonly SectionReviewStatus[] = [
  SECTION_REVIEW_STATUS.REVIEWED,
  SECTION_REVIEW_STATUS.FLAGGED,
  SECTION_REVIEW_STATUS.REJECTED,
];

export function isSectionReviewStatus(v: unknown): v is SectionReviewStatus {
  return typeof v === "string" && (SECTION_REVIEW_STATUS_VALUES as readonly string[]).includes(v);
}
