"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SectionHeader } from "./SectionHeader";
import { SectionNotesHistory } from "./SectionNotesHistory";
import type { ApplicationSectionReview } from "@/types";

interface Ctx {
  applicationId: string;
  reviewsBySection: Record<string, ApplicationSectionReview[]>;
  addReview: (review: ApplicationSectionReview) => void;
}

const SectionReviewsContext = createContext<Ctx | null>(null);

function groupBySection(
  reviews: ApplicationSectionReview[],
): Record<string, ApplicationSectionReview[]> {
  // Caller-provided list is sorted DESC; preserve order while bucketing.
  const out: Record<string, ApplicationSectionReview[]> = {};
  for (const r of reviews) {
    (out[r.section_key] ||= []).push(r);
  }
  return out;
}

export function AdminApplicationSectionsProvider({
  applicationId,
  initialReviews,
  children,
}: {
  applicationId: string;
  initialReviews: ApplicationSectionReview[];
  children: ReactNode;
}) {
  const [reviews, setReviews] = useState<ApplicationSectionReview[]>(
    initialReviews,
  );

  const reviewsBySection = useMemo(() => groupBySection(reviews), [reviews]);

  const addReview = useCallback((r: ApplicationSectionReview) => {
    setReviews((prev) => [r, ...prev]);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ applicationId, reviewsBySection, addReview }),
    [applicationId, reviewsBySection, addReview],
  );

  return (
    <SectionReviewsContext.Provider value={value}>
      {children}
    </SectionReviewsContext.Provider>
  );
}

export function useSectionReview(sectionKey: string) {
  const ctx = useContext(SectionReviewsContext);
  if (!ctx) {
    throw new Error(
      "useSectionReview must be used inside AdminApplicationSectionsProvider",
    );
  }
  const history = ctx.reviewsBySection[sectionKey] ?? [];
  const latest = history[0] ?? null;
  const currentStatus = latest?.status ?? null;
  return {
    applicationId: ctx.applicationId,
    sectionKey,
    currentStatus,
    // B-100 — latest row exposed so callers can hand `reviewed_at`,
    // `profiles.full_name`, and `notes` to `SectionReviewBadge`'s
    // hover tooltip. Null when no review has been recorded yet.
    latest,
    history,
    onReviewSaved: ctx.addReview,
  };
}

interface ConnectedSectionHeaderProps {
  title: string;
  sectionKey: string;
  rightSlot?: ReactNode;
}

export function ConnectedSectionHeader({
  title,
  sectionKey,
  rightSlot,
}: ConnectedSectionHeaderProps) {
  const { applicationId, currentStatus, onReviewSaved, latest } =
    useSectionReview(sectionKey);
  return (
    <SectionHeader
      title={title}
      applicationId={applicationId}
      sectionKey={sectionKey}
      currentStatus={currentStatus}
      onReviewSaved={onReviewSaved}
      rightSlot={rightSlot}
      latestReview={latest}
    />
  );
}

export function ConnectedNotesHistory({ sectionKey }: { sectionKey: string }) {
  const { history } = useSectionReview(sectionKey);
  return <SectionNotesHistory reviews={history} />;
}

// B-077 Batch 5 — per-key snapshot of latest reviews for the
// PerProfileReviewSummaryPanel. Uses the context once so callers can
// iterate keys without violating React's hook rules.
export function useSectionReviews(sectionKeys: string[]): {
  applicationId: string;
  rows: {
    sectionKey: string;
    latest: ApplicationSectionReview | null;
    history: ApplicationSectionReview[];
  }[];
  addReview: (review: ApplicationSectionReview) => void;
} {
  const ctx = useContext(SectionReviewsContext);
  if (!ctx) {
    throw new Error(
      "useSectionReviews must be used inside AdminApplicationSectionsProvider",
    );
  }
  const rows = sectionKeys.map((sectionKey) => {
    const history = ctx.reviewsBySection[sectionKey] ?? [];
    return { sectionKey, latest: history[0] ?? null, history };
  });
  return {
    applicationId: ctx.applicationId,
    rows,
    addReview: ctx.addReview,
  };
}

// B-069 — aggregate of multiple sections (e.g. one wizard step covers
// several section_keys). Used by the admin step indicator.
//
// B-100 — returns `latest` too: the most-recent review row whose status
// matches the aggregate verdict. Lets callers render the
// `SectionReviewBadge` tooltip with reviewer + date + notes for the
// review that drove the aggregate.
export function useAggregateStatus(sectionKeys: string[]): {
  status: ApplicationSectionReview["status"] | null;
  reviewedCount: number;
  totalCount: number;
  latest: ApplicationSectionReview | null;
} {
  const ctx = useContext(SectionReviewsContext);
  if (!ctx) {
    throw new Error(
      "useAggregateStatus must be used inside AdminApplicationSectionsProvider",
    );
  }
  const totalCount = sectionKeys.length;
  if (totalCount === 0)
    return { status: null, reviewedCount: 0, totalCount: 0, latest: null };

  let reviewedCount = 0;
  let mostRecentRejected: ApplicationSectionReview | null = null;
  let mostRecentFlagged: ApplicationSectionReview | null = null;
  let mostRecentReviewed: ApplicationSectionReview | null = null;
  let allReviewed = true;
  for (const key of sectionKeys) {
    const latest = ctx.reviewsBySection[key]?.[0];
    if (!latest) {
      allReviewed = false;
      continue;
    }
    reviewedCount++;
    if (latest.status === "rejected") {
      if (
        !mostRecentRejected ||
        new Date(latest.reviewed_at) > new Date(mostRecentRejected.reviewed_at)
      ) {
        mostRecentRejected = latest;
      }
    } else if (latest.status === "flagged") {
      if (
        !mostRecentFlagged ||
        new Date(latest.reviewed_at) > new Date(mostRecentFlagged.reviewed_at)
      ) {
        mostRecentFlagged = latest;
      }
    } else if (latest.status === "reviewed") {
      if (
        !mostRecentReviewed ||
        new Date(latest.reviewed_at) > new Date(mostRecentReviewed.reviewed_at)
      ) {
        mostRecentReviewed = latest;
      }
    }
    if (latest.status !== "reviewed") allReviewed = false;
  }
  if (mostRecentRejected)
    return { status: "rejected", reviewedCount, totalCount, latest: mostRecentRejected };
  if (mostRecentFlagged)
    return { status: "flagged", reviewedCount, totalCount, latest: mostRecentFlagged };
  if (allReviewed && mostRecentReviewed)
    return { status: "reviewed", reviewedCount, totalCount, latest: mostRecentReviewed };
  return { status: null, reviewedCount, totalCount, latest: null };
}
