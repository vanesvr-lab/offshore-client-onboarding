"use client";

import { CardHeader, CardTitle } from "@/components/ui/card";
import { SectionReviewBadge } from "./SectionReviewBadge";
import { SectionReviewButton } from "./SectionReviewButton";
import type { ApplicationSectionReview, SectionReviewStatus } from "@/types";

interface Props {
  title: string;
  applicationId: string;
  sectionKey: string;
  currentStatus: SectionReviewStatus | null;
  onReviewSaved: (review: ApplicationSectionReview) => void;
  rightSlot?: React.ReactNode;
}

export function SectionHeader({
  title,
  applicationId,
  sectionKey,
  currentStatus,
  onReviewSaved,
  rightSlot,
}: Props) {
  return (
    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <SectionReviewBadge status={currentStatus} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {rightSlot}
        <SectionReviewButton
          applicationId={applicationId}
          sectionKey={sectionKey}
          sectionLabel={title}
          currentStatus={currentStatus}
          onReviewSaved={onReviewSaved}
        />
      </div>
    </CardHeader>
  );
}
