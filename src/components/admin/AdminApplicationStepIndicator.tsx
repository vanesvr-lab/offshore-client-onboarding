"use client";

import { Fragment } from "react";
import { CheckCircle2, Flag, XCircle, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAggregateStatus } from "./AdminApplicationSections";

export interface AdminStep {
  id: string;          // anchor id, e.g. "step-company-setup"
  label: string;       // "Company Setup"
  sectionKeys: string[]; // section_keys aggregated for the step's status pill
}

interface Props {
  steps: AdminStep[];
}

/**
 * B-069 Batch 1 — admin-side step indicator. Visual mirror of the client's
 * `ServiceWizardStepIndicator` (breadcrumb with chevrons), but each step
 * shows an aggregate review-status pill instead of completed/current.
 *
 * Click a step → smooth-scroll to the matching anchor (added in Batch 2).
 */
export function AdminApplicationStepIndicator({ steps }: Props) {
  return (
    <nav
      aria-label="Application sections"
      className="flex flex-wrap items-center gap-1 text-sm"
    >
      {steps.map((step, i) => (
        <Fragment key={step.id}>
          {i > 0 ? (
            <ChevronRight
              className="size-3.5 shrink-0 text-gray-400"
              aria-hidden="true"
            />
          ) : null}
          <StepPill step={step} index={i} />
        </Fragment>
      ))}
    </nav>
  );
}

function StepPill({ step, index }: { step: AdminStep; index: number }) {
  const { status, reviewedCount, totalCount } = useAggregateStatus(
    step.sectionKeys,
  );

  function handleClick() {
    const el = document.getElementById(step.id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const Icon =
    status === "approved"
      ? CheckCircle2
      : status === "rejected"
        ? XCircle
        : status === "flagged"
          ? Flag
          : Circle;

  const iconColor =
    status === "approved"
      ? "text-emerald-600"
      : status === "rejected"
        ? "text-red-600"
        : status === "flagged"
          ? "text-amber-600"
          : "text-gray-400";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded px-2 text-gray-700 transition-colors",
        "hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
      )}
    >
      <span className="text-gray-400">{index + 1}.</span>
      <Icon className={cn("size-3.5 shrink-0", iconColor)} aria-hidden="true" />
      <span className="font-medium text-brand-navy">{step.label}</span>
      {totalCount > 0 && status !== "approved" && reviewedCount < totalCount ? (
        <span className="text-xs text-gray-400">
          {reviewedCount}/{totalCount} reviewed
        </span>
      ) : null}
    </button>
  );
}
