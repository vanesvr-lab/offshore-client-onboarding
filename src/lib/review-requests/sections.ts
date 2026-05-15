// B-118 — Shared section-key constants + label table for the peer-review
// feature. The same vocabulary surfaces in the modal section picker, the
// banner anchor list, the right-rail card tooltip, and the email body.

export const TOP_LEVEL_SECTION_KEYS = [
  "company_setup",
  "financial",
  "banking",
  "documents",
] as const;

export type TopLevelSectionKey = (typeof TOP_LEVEL_SECTION_KEYS)[number];

export const PEOPLE_KYC_PROFILE_KEY = "people_kyc_profile" as const;

export type ReviewSectionKey = TopLevelSectionKey | typeof PEOPLE_KYC_PROFILE_KEY;

export const SECTION_LABELS: Record<TopLevelSectionKey, string> = {
  company_setup: "Company Setup",
  financial: "Financial",
  banking: "Banking",
  documents: "Documents",
};

// Anchor ids each top-level section uses on the service page. Kept here
// so the banner and the right-rail detail dialog don't need to know
// about the page's internal DOM structure beyond a single import. Must
// match the `anchorId` props passed to `<ServiceCollapsibleSection />`
// inside `ServiceDetailClient`.
export const SECTION_ANCHORS: Record<TopLevelSectionKey, string> = {
  company_setup: "step-company-setup",
  financial: "step-financial",
  banking: "step-banking",
  documents: "step-documents",
};

export function isTopLevelSectionKey(key: string): key is TopLevelSectionKey {
  return (TOP_LEVEL_SECTION_KEYS as readonly string[]).includes(key);
}

export function isReviewSectionKey(key: string): key is ReviewSectionKey {
  return isTopLevelSectionKey(key) || key === PEOPLE_KYC_PROFILE_KEY;
}
