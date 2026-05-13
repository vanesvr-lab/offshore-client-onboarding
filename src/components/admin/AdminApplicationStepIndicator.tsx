"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
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
 * B-069 Batch 1 — admin-side step indicator (numbered breadcrumb).
 * B-098 — restyled to pill button language (matches the rest of the
 * page after B-096 turned every `<Button>` into a pill): each step
 * renders as a rounded-full pill, brand-navy fill for the active step,
 * light-gray fill for inactive. Chevron separators preserved. Anchor
 * smooth-scroll behaviour unchanged.
 *
 * "Active" = whichever step's anchor is currently nearest the top of
 * the viewport, derived from a scroll listener. When nothing is in
 * range (e.g. user is above the first section) the first step is
 * treated as active so a pill always reads as the current focus.
 */
export function AdminApplicationStepIndicator({ steps }: Props) {
  const activeId = useActiveStepId(steps);
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
          <StepPill step={step} index={i} isActive={step.id === activeId} />
        </Fragment>
      ))}
    </nav>
  );
}

function StepPill({
  step,
  index,
  isActive,
}: {
  step: AdminStep;
  index: number;
  isActive: boolean;
}) {
  const { reviewedCount, totalCount } = useAggregateStatus(step.sectionKeys);

  function handleClick() {
    const el = document.getElementById(step.id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={isActive ? "step" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        isActive
          ? "bg-brand-navy text-white hover:bg-brand-navy/90"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200",
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
          isActive ? "bg-white text-brand-navy" : "bg-white text-gray-500",
        )}
      >
        {index + 1}
      </span>
      <span className="font-medium">{step.label}</span>
      {totalCount > 0 ? (
        <span
          className={cn(
            "text-xs tabular-nums",
            isActive ? "text-white/80" : "text-gray-500",
          )}
        >
          {reviewedCount}/{totalCount}
        </span>
      ) : null}
    </button>
  );
}

// Find the step anchor closest to the top of the viewport. Re-evaluates
// on scroll + resize. Returns `null` until first measurement (which
// then falls back to the first step in the render path).
function useActiveStepId(steps: AdminStep[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (steps.length === 0) return;

    function measure() {
      const OFFSET = 200; // approx height of sticky shell above content
      let best: { id: string; distance: number } | null = null;
      for (const step of steps) {
        const el = document.getElementById(step.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Distance from anchor top to the visual "current line" (just
        // below the sticky header). Negative = anchor already passed.
        const distance = rect.top - OFFSET;
        if (distance <= 0) {
          if (best === null || distance > best.distance) {
            best = { id: step.id, distance };
          }
        }
      }
      setActiveId(best?.id ?? steps[0].id);
    }

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [steps]);

  return activeId;
}
