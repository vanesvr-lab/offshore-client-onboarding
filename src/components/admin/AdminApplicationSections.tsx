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
