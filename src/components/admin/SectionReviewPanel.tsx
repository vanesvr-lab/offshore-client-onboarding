"use client";

// B-068 Batch 3 — minimal panel scaffold so SectionReviewButton compiles.
// Real form (status radios, notes textarea, POST) lands in Batch 4.

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ApplicationSectionReview, SectionReviewStatus } from "@/types";

interface Props {
  applicationId: string;
  sectionKey: string;
  sectionLabel: string;
  currentStatus: SectionReviewStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (review: ApplicationSectionReview) => void;
}

export function SectionReviewPanel({
  sectionLabel,
  open,
  onOpenChange,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Review: {sectionLabel}</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}
