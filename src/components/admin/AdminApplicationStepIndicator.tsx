"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import type { PillState } from "@/lib/services/stepState";

export interface AdminStep {
  id: string;          // anchor id, e.g. "step-company-setup"
  label: string;       // "Company Setup"
  sectionKeys: string[]; // section_keys aggregated for the step's status pill
  /** B-111 — readiness state. Drives pill color + tooltip. Undefined =
   *  fall back to brand-navy (pre-B-111 visual), preserving any caller
   *  that hasn't migrated. */
  state?: PillState;
  /** B-111 — small inline badge after the label (e.g. "40%",
   *  "2 missing", "ready"). Null/undefined hides it. */
  countBadge?: string | null;
  /** B-111 — full hover-title text describing the state + reviewer info. */
  tooltip?: string;
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

// B-111 — per-state pill styling. Numbered badge is always white-on-state
// so the contrast against the colored pill background reads cleanly.
const STATE_STYLES: Record<
  PillState,
  { bg: string; badgeText: string }
> = {
  complete:    { bg: "bg-green-600  hover:bg-green-700",  badgeText: "text-green-700" },
  in_review:   { bg: "bg-blue-600   hover:bg-blue-700",   badgeText: "text-blue-700" },
  in_progress: { bg: "bg-amber-500  hover:bg-amber-600",  badgeText: "text-amber-700" },
  flagged:     { bg: "bg-amber-600  hover:bg-amber-700",  badgeText: "text-amber-800" },
  rejected:    { bg: "bg-red-600    hover:bg-red-700",    badgeText: "text-red-700" },
  not_started: { bg: "bg-gray-400   hover:bg-gray-500",   badgeText: "text-gray-700" },
};

const DEFAULT_PILL_BG = "bg-brand-navy hover:bg-brand-navy/90";
const DEFAULT_BADGE_TEXT = "text-brand-navy";

/**
 * B-069 Batch 1 — admin-side step indicator (numbered breadcrumb).
 * B-098 — restyled to pill button language.
 * B-099 — every pill renders uniformly brand-navy/white; no per-pill
 * `isActive` detection and no `n/m` review counts. Click is delegated
 * to the parent via `onStepClick` so the page root can drive an
 * accordion over the 3 form section cards (Company Setup / Financial
 * / Banking) and skip the toggle for People & KYC / Documents.
 * B-111 — pills now reflect a `state` per step (rejected / flagged /
 * complete / in_review / in_progress / not_started) with an optional
 * inline `countBadge` after the label. Steps without a state fall back
 * to the B-099 brand-navy default.
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
  const styles = step.state ? STATE_STYLES[step.state] : null;
  const bg = styles?.bg ?? DEFAULT_PILL_BG;
  const badgeText = styles?.badgeText ?? DEFAULT_BADGE_TEXT;
  return (
    <button
      type="button"
      onClick={onClick}
      title={step.tooltip ?? undefined}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${bg}`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-semibold ${badgeText}`}
      >
        {index + 1}
      </span>
      <span className="font-medium">{step.label}</span>
      {step.countBadge ? (
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
          {step.countBadge}
        </span>
      ) : null}
    </button>
  );
}
