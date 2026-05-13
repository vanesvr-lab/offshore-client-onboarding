"use client";

// B-109 Batch 2 — Step indicator at the top of the Admin Review Wizard.
// Visual treatment matches the client's `ServiceWizardStepIndicator`
// (numbered breadcrumb with green check on complete, bolded active, muted
// upcoming) so admins see the same wizard language as clients. Adapted for
// admin: every step is clickable (admin can freely jump around the review
// surface — not gated by completion order like the client wizard).

import { Fragment } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useSectionReviews } from "@/components/admin/AdminApplicationSections";
import { cn } from "@/lib/utils";

interface Props {
  currentStep: number;
  sectionKeys: readonly string[];
  labels: readonly string[];
  onStepClick: (step: number) => void;
}

export function AdminReviewWizardStepIndicator({
  currentStep,
  sectionKeys,
  labels,
  onStepClick,
}: Props) {
  const { rows } = useSectionReviews(sectionKeys as string[]);

  return (
    <nav
      aria-label="Wizard progress"
      className="flex items-center gap-1 flex-wrap text-sm"
    >
      {labels.map((label, i) => {
        const isCurrent = i === currentStep;
        const isCompleted = rows[i]?.latest?.status === "reviewed";
        return (
          <Fragment key={i}>
            {i > 0 && (
              <ChevronRight
                className="h-3.5 w-3.5 text-gray-400 shrink-0"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={() => onStepClick(i)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "h-8 px-2 rounded inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer",
                isCurrent && "font-bold text-brand-navy",
                isCompleted && !isCurrent && "text-gray-700 hover:bg-gray-50",
                !isCurrent && !isCompleted && "text-gray-600 hover:bg-gray-50",
              )}
            >
              {isCompleted && (
                <Check
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                  aria-hidden="true"
                />
              )}
              <span>{label}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
