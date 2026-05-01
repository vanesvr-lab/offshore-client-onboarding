"use client";

/**
 * B-047 — Segmented Yes/No pill (radiogroup).
 *
 *  - Two side-by-side buttons, ~120px wide, h-11 (44px touch target),
 *    8px gap between (`touch-spacing`).
 *  - Selected: filled brand-navy on white text.
 *  - Unselected: white border, gray-700 text, gray-50 hover.
 *  - Focus ring 2px brand-navy.
 *  - Keyboard: tab into group, ←/→ moves selection, space/enter selects,
 *    tab moves to next field.
 *  - role="radiogroup" wrapper, role="radio" + aria-checked per pill.
 *  - Don't use red for "No" — would imply wrong answer (color-not-only).
 *    Reserve red for downstream compliance flagging when "Yes" is the
 *    sensitive answer.
 */

import { useRef } from "react";

interface YesNoToggleProps {
  /** Tri-state: null = no selection, true = Yes, false = No. */
  value: boolean | null;
  onChange: (next: boolean) => void;
  /** Accessible name for the question this answers. Used as the radiogroup label. */
  ariaLabel: string;
  /** Disable both pills. */
  disabled?: boolean;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

const PILL_BASE =
  "inline-flex items-center justify-center min-w-[120px] h-11 px-4 text-sm font-medium rounded-md " +
  "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const PILL_SELECTED = "bg-brand-navy text-white border border-brand-navy";
const PILL_UNSELECTED =
  "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50";

export function YesNoToggle({
  value,
  onChange,
  ariaLabel,
  disabled,
  className = "",
}: YesNoToggleProps) {
  const yesRef = useRef<HTMLButtonElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, current: boolean) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = !current;
      onChange(next);
      (next ? yesRef.current : noRef.current)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = !current;
      onChange(next);
      (next ? yesRef.current : noRef.current)?.focus();
    }
  }

  // First pill in tab order: the selected one. If nothing selected, Yes is
  // the entry point (per WAI-ARIA radiogroup pattern — group has one tab stop).
  const yesTabIndex = value === true || value === null ? 0 : -1;
  const noTabIndex = value === false ? 0 : -1;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-2 ${className}`.trim()}
    >
      <button
        ref={yesRef}
        type="button"
        role="radio"
        aria-checked={value === true}
        tabIndex={yesTabIndex}
        disabled={disabled}
        onClick={() => onChange(true)}
        onKeyDown={(e) => handleKeyDown(e, true)}
        className={`${PILL_BASE} ${value === true ? PILL_SELECTED : PILL_UNSELECTED}`}
      >
        Yes
      </button>
      <button
        ref={noRef}
        type="button"
        role="radio"
        aria-checked={value === false}
        tabIndex={noTabIndex}
        disabled={disabled}
        onClick={() => onChange(false)}
        onKeyDown={(e) => handleKeyDown(e, false)}
        className={`${PILL_BASE} ${value === false ? PILL_SELECTED : PILL_UNSELECTED}`}
      >
        No
      </button>
    </div>
  );
}
