"use client";

import { Fragment } from "react";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_STEP_LABELS = ["Company Setup", "Financial", "Banking", "People & KYC", "Documents"];

interface Props {
  currentStep: number;       // 0-indexed
  completedSteps: number[];  // indices of completed steps
  onStepClick: (step: number) => void;
  /** B-049 — caller may pass a shorter label set when the Documents step is hidden. */
  labels?: string[];
}

/**
 * B-055 §3.1 — Top wizard stepper renders as a horizontal breadcrumb
 * (`Company Setup › Financial › ... › Documents`) instead of the older
 * dot+line layout. Completed steps get a green check + are clickable so
 * the user can jump back; the current step is bolded; future steps are
 * muted and not clickable. `flex-wrap` lets the breadcrumb wrap on
 * narrow viewports — no horizontal scroll.
 */
export function ServiceWizardStepIndicator({ currentStep, completedSteps, onStepClick, labels }: Props) {
  const STEP_LABELS = labels ?? DEFAULT_STEP_LABELS;
  return (
    <nav
      aria-label="Wizard progress"
      className="flex items-center gap-1 flex-wrap text-sm mb-6"
    >
      {STEP_LABELS.map((label, i) => {
        const isCurrent = i === currentStep;
        const isCompleted = completedSteps.includes(i);
        const isClickable = isCompleted || (i < currentStep);
        return (
          <Fragment key={i}>
            {i > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-hidden="true" />
            )}
            <button
              type="button"
              disabled={!isClickable}
              onClick={isClickable ? () => onStepClick(i) : undefined}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "h-8 px-2 rounded inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                isCurrent && "font-bold text-brand-navy",
                isCompleted && !isCurrent && "text-gray-700 hover:bg-gray-50 cursor-pointer",
                !isCurrent && !isCompleted && !isClickable && "text-gray-400 cursor-default",
                !isCurrent && !isCompleted && isClickable && "text-gray-600 hover:bg-gray-50 cursor-pointer"
              )}
            >
              {isCompleted && (
                <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              )}
              <span>{label}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
