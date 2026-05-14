// B-111 Batch 2 — pure derivation of the right-rail Pending card list.
//
// One row per actionable item across the service: rejected/flagged
// sections (review verdicts), incomplete sections (no review yet, pct
// < 100), 100%-but-unreviewed sections (ready-for-review pings), missing
// service-level docs (waiver-aware), per-profile KYC gaps, and B-108
// auto + manual alerts. Sorted critical → warning → info, stable within
// tier.
//
// Side-effect free: the page memos this with the same data that drives
// the rest of the surface, so the Pending list re-derives immediately on
// save / waive / mark-reviewed.

import type {
  ApplicationSectionReview,
  SectionReviewStatus,
} from "@/types";
import type {
  AutoAlert,
  AutoAlertSeverity,
} from "@/lib/alerts/computeAutoAlerts";

export type PendingSeverity = "critical" | "warning" | "info";

export type PendingActionType =
  | "scroll_to_section"
  | "scroll_to_profile"
  | "open_document"
  | "open_alert";

export interface PendingItem {
  id: string;
  severity: PendingSeverity;
  label: string;
  detail?: string;
  actionType: PendingActionType;
  actionPayload: string;
  /** B-113 Batch 3 — when set, this row is scoped to a specific profile
   *  and should also surface in that profile's per-profile Pending
   *  popover. Step-level / service-level rows leave this `undefined`. */
  profileId?: string;
}

// Caller maps each step's `section_key` and human label here once; the
// computer reuses both for label rendering + sectionReview lookup. Keeps
// the step ↔ section_key relation in one place (the page's
// ADMIN_STEPS_SERVICES) rather than duplicating it.
export interface PendingStepConfig {
  /** DOM anchor id, e.g. `step-company-setup`. */
  stepId: string;
  /** `application_section_reviews.section_key` for this step. */
  sectionKey: string;
  /** Human label for the row, e.g. "Company Setup". */
  label: string;
  /** Step completion percentage. */
  pct: number;
}

export interface PendingProfileInput {
  id: string;
  full_name: string | null;
  /** KYC completion %. */
  kycPct: number;
  /** Skip representatives — they don't have KYC of their own. */
  isRepresentative: boolean;
}

export interface PendingManualAlert {
  id: string;
  severity: PendingSeverity;
  title: string;
  note: string | null;
  status: "open" | "resolved";
}

export interface ComputePendingInput {
  steps: PendingStepConfig[];
  sectionReviews: ApplicationSectionReview[];
  profiles: PendingProfileInput[];
  /** Pre-counted, waiver-aware, from the page's `missingDocCount` memo. */
  missingDocCount: number;
  /** Visible (non-dismissed) auto-alerts from B-108. */
  autoAlerts: AutoAlert[];
  /** Open manual alerts from B-108 (status === "open"). */
  manualAlerts: PendingManualAlert[];
}

function severityForSection(status: SectionReviewStatus): PendingSeverity {
  if (status === "rejected") return "critical";
  if (status === "flagged") return "warning";
  return "info";
}

function severityForAuto(s: AutoAlertSeverity): PendingSeverity {
  // The two severity spaces happen to use the same labels, but be
  // explicit so a future expansion (e.g. "high") wouldn't silently
  // collapse to one of the existing tiers.
  if (s === "critical") return "critical";
  if (s === "warning") return "warning";
  return "info";
}

const SEVERITY_ORDER: Record<PendingSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function computePendingItems(input: ComputePendingInput): PendingItem[] {
  const items: PendingItem[] = [];
  const reviewBySection = new Map<string, ApplicationSectionReview>();
  for (const r of input.sectionReviews) {
    // Reviews are pre-sorted DESC by `reviewed_at` from the loader; first
    // write per key wins so we keep the most recent.
    if (!reviewBySection.has(r.section_key)) reviewBySection.set(r.section_key, r);
  }

  // 1. Per-step verdict + completion rows. One row per step at most so the
  //    list doesn't double up (e.g. "rejected" + "incomplete" for the same
  //    step would be noise).
  for (const step of input.steps) {
    const review = reviewBySection.get(step.sectionKey) ?? null;

    if (review?.status === "rejected") {
      items.push({
        id: `rejected_${step.sectionKey}`,
        severity: "critical",
        label: `${step.label} — rejected`,
        detail: review.notes ?? undefined,
        actionType: "scroll_to_section",
        actionPayload: step.stepId,
      });
      continue;
    }
    if (review?.status === "flagged") {
      items.push({
        id: `flagged_${step.sectionKey}`,
        severity: "warning",
        label: `${step.label} — flagged`,
        detail: review.notes ?? undefined,
        actionType: "scroll_to_section",
        actionPayload: step.stepId,
      });
      continue;
    }
    if (review?.status === "reviewed" && review.force_reviewed && step.pct < 100) {
      // B-110 — force-reviewed incomplete sections still need follow-up:
      // surface the override as a warning so admin can fill the missing
      // fields when convenient. Notes carry the original "why" from the
      // override dialog.
      items.push({
        id: `force_reviewed_${step.sectionKey}`,
        severity: "warning",
        label: `${step.label} — reviewed with override (${step.pct}%)`,
        detail: review.notes ?? undefined,
        actionType: "scroll_to_section",
        actionPayload: step.stepId,
      });
      continue;
    }
    if (review?.status === "reviewed") {
      // Clean reviewed: nothing pending.
      continue;
    }

    // No review yet. Surface based on completion.
    if (step.pct < 100) {
      items.push({
        id: `incomplete_${step.sectionKey}`,
        severity: "warning",
        label: `${step.label} — ${step.pct}% complete`,
        actionType: "scroll_to_section",
        actionPayload: step.stepId,
      });
    } else {
      // 100% and no review → ready-for-review nudge (info tier).
      items.push({
        id: `ready_${step.sectionKey}`,
        severity: "info",
        label: `${step.label} — ready for review`,
        actionType: "scroll_to_section",
        actionPayload: step.stepId,
      });
    }
  }

  // 2. Missing required service-level docs. Single rolled-up row — the
  //    Documents step item above already drove admin there if incomplete,
  //    but this surfaces the exact count separately so a 100%-by-waiver
  //    case doesn't hide truly missing uploads.
  if (input.missingDocCount > 0) {
    items.push({
      id: "missing_documents",
      severity: "warning",
      label: `${input.missingDocCount} required document${
        input.missingDocCount === 1 ? "" : "s"
      } missing`,
      actionType: "scroll_to_section",
      actionPayload: "step-documents",
    });
  }

  // 3. Per-profile KYC gaps (info tier — the People & KYC step row above
  //    already drove admin to the bigger picture).
  for (const p of input.profiles) {
    if (p.isRepresentative) continue;
    if (p.kycPct >= 100) continue;
    items.push({
      id: `profile_kyc_${p.id}`,
      severity: "info",
      label: `${p.full_name ?? "Unnamed profile"} — KYC ${p.kycPct}% complete`,
      actionType: "scroll_to_profile",
      actionPayload: p.id,
      profileId: p.id,
    });
  }

  // 4. Auto alerts — critical + warning bubble up next to the section
  //    rows; info-tier doc expiry / KYC age stay in the dedicated Alerts
  //    dialog so the Pending list stays focused on onboarding completion.
  for (const a of input.autoAlerts) {
    if (a.severity === "info") continue;
    items.push({
      id: `auto_alert_${a.key}`,
      severity: severityForAuto(a.severity),
      label: a.title,
      detail: a.note || undefined,
      actionType:
        a.sourceEntityType === "document" ? "open_document" : "scroll_to_profile",
      actionPayload: a.sourceEntityId,
      // B-113 Batch 3 — profile-scope tag for the per-profile popover.
      // Document-scoped alerts get their profile attribution at the
      // caller (lookup against the docs list), so we only tag the
      // direct profile case here.
      profileId:
        a.sourceEntityType === "profile" ? a.sourceEntityId : undefined,
    });
  }

  // 5. Open manual alerts — always surfaced (admin authored them, they're
  //    already filtered to `open`).
  for (const m of input.manualAlerts) {
    if (m.status !== "open") continue;
    items.push({
      id: `manual_alert_${m.id}`,
      severity: m.severity,
      label: m.title,
      detail: m.note ?? undefined,
      actionType: "open_alert",
      actionPayload: m.id,
    });
  }

  return items.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

export { severityForSection };

// B-113 Batch 3 — per-profile pending compute.
//
// Drives the popover on each profile's "Pending (N)" button. Surfaces
// concerns scoped to a single profile that the service-level list
// either rolls up to step-level or filters out entirely:
//   1. Missing required KYC fields (DD-level-gated; mirrors the
//      Batch 1 `calcKycPct` field set).
//   2. Missing required KYC docs (waiver-aware).
//   3. Profile-scoped auto-alerts at warning/critical severity — both
//      `sourceEntityType === "profile"` and `sourceEntityType ===
//      "document"` when the document belongs to this profile.
//
// Sorted critical → warning → info. Manual alerts aren't yet
// profile-linked (`service_alerts` only knows about the service); a
// tech-debt entry tracks adding `client_profile_id`.

interface ProfilePendingDocInput {
  id: string;
  document_type_id: string | null;
  client_profile_id: string | null;
}

interface ProfilePendingDocTypeInput {
  id: string;
  name: string;
}

interface ProfilePendingWaiverInput {
  scope: string;
  client_profile_id: string | null;
  document_type_id: string;
}

export interface ProfilePendingInput {
  profile: {
    id: string;
    full_name: string | null;
    is_representative: boolean;
  };
  kyc: Record<string, unknown> | null;
  ddLevel: string | null;
  profileDocuments: ProfilePendingDocInput[];
  documentTypes: ProfilePendingDocTypeInput[];
  waivers: ProfilePendingWaiverInput[];
  autoAlerts: AutoAlert[];
}

const PROFILE_REQUIRED_FIELDS_BASE = [
  "date_of_birth",
  "nationality",
  "passport_number",
  "passport_expiry",
  "occupation",
  "address",
] as const;

const FIELD_LABELS: Record<string, string> = {
  date_of_birth: "Date of birth",
  nationality: "Nationality",
  passport_number: "Passport number",
  passport_expiry: "Passport expiry",
  occupation: "Occupation",
  address: "Address",
  source_of_wealth_description: "Source of wealth description",
};

function formatFieldLabel(field: string): string {
  return (
    FIELD_LABELS[field] ??
    field
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export function computeProfilePendingItems(
  input: ProfilePendingInput,
): PendingItem[] {
  const out: PendingItem[] = [];

  // Representatives don't carry KYC of their own — empty list keeps the
  // button hidden.
  if (input.profile.is_representative) return out;

  // 1. Missing required KYC fields (DD-aware, mirrors `calcKycPct`).
  const requiredFields: string[] = [...PROFILE_REQUIRED_FIELDS_BASE];
  if (input.ddLevel === "edd") {
    requiredFields.push("source_of_wealth_description");
  }
  for (const f of requiredFields) {
    const v = input.kyc?.[f];
    if (typeof v === "boolean") continue;
    if (v == null || v === "") {
      out.push({
        id: `field_${input.profile.id}_${f}`,
        severity: "warning",
        label: `${formatFieldLabel(f)} — missing`,
        actionType: "scroll_to_profile",
        actionPayload: input.profile.id,
        profileId: input.profile.id,
      });
    }
  }

  // 2. Missing required KYC docs (waiver-aware). `documentTypes` is the
  //    person-scope, active list already filtered by the caller.
  for (const dt of input.documentTypes) {
    const isUploaded = input.profileDocuments.some(
      (d) =>
        d.document_type_id === dt.id &&
        d.client_profile_id === input.profile.id,
    );
    const isWaived = input.waivers.some(
      (w) =>
        w.scope === "person" &&
        w.client_profile_id === input.profile.id &&
        w.document_type_id === dt.id,
    );
    if (!isUploaded && !isWaived) {
      out.push({
        id: `doc_${input.profile.id}_${dt.id}`,
        severity: "warning",
        label: `${dt.name} — not uploaded`,
        actionType: "scroll_to_profile",
        actionPayload: input.profile.id,
        profileId: input.profile.id,
      });
    }
  }

  // 3. Profile-scoped auto alerts. Document-scoped alerts are attributed
  //    here via the profile's documents (the service-level
  //    `computePendingItems` can't do this lookup because it doesn't
  //    receive the docs map).
  for (const a of input.autoAlerts) {
    if (a.severity === "info") continue;
    const isThisProfile =
      (a.sourceEntityType === "profile" &&
        a.sourceEntityId === input.profile.id) ||
      (a.sourceEntityType === "document" &&
        input.profileDocuments.some((d) => d.id === a.sourceEntityId));
    if (!isThisProfile) continue;
    out.push({
      id: `alert_${input.profile.id}_${a.key}`,
      severity: severityForAuto(a.severity),
      label: a.title,
      detail: a.note || undefined,
      actionType:
        a.sourceEntityType === "document"
          ? "open_document"
          : "scroll_to_profile",
      actionPayload:
        a.sourceEntityType === "document"
          ? a.sourceEntityId
          : input.profile.id,
      profileId: input.profile.id,
    });
  }

  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}
