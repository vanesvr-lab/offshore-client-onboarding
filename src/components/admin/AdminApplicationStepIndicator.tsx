"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";

export interface AdminStep {
  id: string;          // anchor id, e.g. "step-company-setup"
  label: string;       // "Company Setup"
  sectionKeys: string[]; // section_keys aggregated for the step's status pill
}

interface Props {
  steps: AdminStep[];
  /** B-099 — parent-provided click handler. Called with the step's id
   *  (`step-company-setup`, `step-financial`, …). The parent decides
   *  whether to toggle a section (form-step keys) and is responsible
   *  for the smooth-scroll. If omitted, the pill falls back to a
   *  local scroll-only handler. */
  onStepClick?: (stepId: string) => void;
}

/**
 * B-069 Batch 1 — admin-side step indicator (numbered breadcrumb).
 * B-098 — restyled to pill button language.
 * B-099 — every pill renders uniformly brand-navy/white; no per-pill
 * `isActive` detection and no `n/m` review counts. Click is delegated
 * to the parent via `onStepClick` so the page root can drive an
 * accordion over the 3 form section cards (Company Setup / Financial
 * / Banking) and skip the toggle for People & KYC / Documents.
 */
export function AdminApplicationStepIndicator({ steps, onStepClick }: Props) {
  function handleClick(stepId: string) {
    if (onStepClick) {
      onStepClick(stepId);
      return;
    }
    document.getElementById(stepId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <nav
      aria-label="Application sections"
      className="flex flex-wrap items-center gap-1.5 text-sm"
    >
      {steps.map((step, i) => (
        <Fragment key={step.id}>
          {i > 0 ? (
            <ChevronRight
              className="size-3.5 shrink-0 text-gray-400"
              aria-hidden="true"
            />
          ) : null}
          <StepPill step={step} index={i} onClick={() => handleClick(step.id)} />
        </Fragment>
      ))}
    </nav>
  );
}

function StepPill({
  step,
  index,
  onClick,
}: {
  step: AdminStep;
  index: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-brand-navy px-3 py-1.5 text-sm text-white transition-colors hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-brand-navy">
        {index + 1}
      </span>
      <span className="font-medium">{step.label}</span>
    </button>
  );
}
