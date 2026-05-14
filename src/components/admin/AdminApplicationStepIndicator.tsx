"use client";

import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import type { PillState } from "@/lib/services/stepState";

export type ReviewState = "reviewed" | "flagged" | "rejected" | "not_reviewed";

export interface AdminStep {
  id: string;          // anchor id, e.g. "step-company-setup"
  label: string;       // "Company Setup"
  sectionKeys: string[]; // section_keys aggregated for the step's status pill
  /** B-111 — readiness state. Retained for callers that still read it
   *  (Pending card derivation, downstream analytics). B-112 no longer
   *  uses it to color the pill body — the pill is always brand-navy. */
  state?: PillState;
  /** B-112 — 0–100. Drives the completion gauge (green at 100, amber otherwise). */
  completionPct?: number;
  /** B-112 — drives the review gauge: full-fill circle + ✓ / ⚑ / ✕ / ○ icon. */
  reviewState?: ReviewState;
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

const REVIEW_BG: Record<ReviewState, string> = {
  reviewed: "#16a34a",
  flagged: "#d97706",
  rejected: "#dc2626",
  not_reviewed: "#475569",
};

const REVIEW_ICON: Record<ReviewState, string> = {
  reviewed: "✓",
  flagged: "⚑",
  rejected: "✕",
  not_reviewed: "○",
};

const REVIEW_LABEL: Record<ReviewState, string> = {
  reviewed: "reviewed",
  flagged: "flagged",
  rejected: "rejected",
  not_reviewed: "not reviewed",
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * B-069 Batch 1 — admin-side step indicator (numbered breadcrumb).
 * B-098 — restyled to pill button language.
 * B-099 — every pill renders uniformly brand-navy/white; click is
 * delegated to the parent via `onStepClick`.
 * B-111 — pills reflected a per-step `state` (rejected / flagged /
 * complete / in_review / in_progress / not_started) with an inline
 * `countBadge`. That treatment painted the row in 5 colors and felt
 * too loud.
 * B-112 — G-2 redesign: pill body returns to uniform brand-navy. Step
 * number moves into the label ("1: Company Setup"). Two SVG gauges sit
 * on the right — completion % (green at 100, amber otherwise; pct in
 * centre) and review state (full-fill circle in green/amber/red/gray
 * with ✓ / ⚑ / ✕ / ○).
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
  const pct = clamp(Math.round(step.completionPct ?? 0), 0, 100);
  const completionStrokeColor = pct >= 100 ? "#4ade80" : "#fbbf24"; // green / amber
  const reviewState: ReviewState = step.reviewState ?? "not_reviewed";
  return (
    <button
      type="button"
      onClick={onClick}
      title={step.tooltip ?? undefined}
      className="inline-flex items-center gap-2 rounded-full bg-brand-navy py-1 pl-3 pr-1.5 text-sm text-white transition-colors hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span className="font-medium leading-none">
        {index + 1}: {step.label}
      </span>
      <CompletionGauge pct={pct} strokeColor={completionStrokeColor} />
      <ReviewGauge
        bg={REVIEW_BG[reviewState]}
        icon={REVIEW_ICON[reviewState]}
        label={REVIEW_LABEL[reviewState]}
      />
    </button>
  );
}

function CompletionGauge({ pct, strokeColor }: { pct: number; strokeColor: string }) {
  const dashTotal = 88; // ~2π × 14
  const dash = (pct / 100) * dashTotal;
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 36 36"
      role="img"
      aria-label={`${pct}% complete`}
    >
      <circle
        cx="18"
        cy="18"
        r="14"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="4"
      />
      <circle
        cx="18"
        cy="18"
        r="14"
        fill="none"
        stroke={strokeColor}
        strokeWidth="4"
        strokeDasharray={`${dash} ${dashTotal}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text
        x="18"
        y="22"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#fff"
      >
        {pct}
      </text>
    </svg>
  );
}

function ReviewGauge({
  bg,
  icon,
  label,
}: {
  bg: string;
  icon: string;
  label: string;
}) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 36 36"
      role="img"
      aria-label={`Review state: ${label}`}
    >
      <circle cx="18" cy="18" r="16" fill={bg} />
      <text
        x="18"
        y="23"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#fff"
      >
        {icon}
      </text>
    </svg>
  );
}
