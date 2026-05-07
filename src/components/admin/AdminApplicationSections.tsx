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
  const currentStatus = history[0]?.status ?? null;
  return {
    applicationId: ctx.applicationId,
    sectionKey,
    currentStatus,
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
  const { applicationId, currentStatus, onReviewSaved } =
    useSectionReview(sectionKey);
  return (
    <SectionHeader
      title={title}
      applicationId={applicationId}
      sectionKey={sectionKey}
      currentStatus={currentStatus}
      onReviewSaved={onReviewSaved}
      rightSlot={rightSlot}
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
export function useAggregateStatus(sectionKeys: string[]): {
  status: ApplicationSectionReview["status"] | null;
  reviewedCount: number;
  totalCount: number;
} {
  const ctx = useContext(SectionReviewsContext);
  if (!ctx) {
    throw new Error(
      "useAggregateStatus must be used inside AdminApplicationSectionsProvider",
    );
  }
  const totalCount = sectionKeys.length;
  if (totalCount === 0) return { status: null, reviewedCount: 0, totalCount: 0 };

  let reviewedCount = 0;
  let hasRejected = false;
  let hasFlagged = false;
  let allApproved = true;
  for (const key of sectionKeys) {
    const latest = ctx.reviewsBySection[key]?.[0];
    if (!latest) {
      allApproved = false;
      continue;
    }
    reviewedCount++;
    if (latest.status === "rejected") hasRejected = true;
    else if (latest.status === "flagged") hasFlagged = true;
    if (latest.status !== "approved") allApproved = false;
  }
  if (hasRejected) return { status: "rejected", reviewedCount, totalCount };
  if (hasFlagged) return { status: "flagged", reviewedCount, totalCount };
  if (allApproved) return { status: "approved", reviewedCount, totalCount };
  return { status: null, reviewedCount, totalCount };
}
