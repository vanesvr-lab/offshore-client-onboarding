"use client";

// B-112 — circular gauges that sit at the top of `/admin/services/[id]`'s
// right rail. Pure UI — the parent passes pre-derived counts. Counts
// re-derive immediately after a save because the parent feeds them from
// the live section-reviews context (`useSectionReviews`).
//
// B-122 — refactored to take an array of gauges so the parent can opt
// the Actions gauge in (only renders when the template has ≥1 action
// binding). Also gained a `size` prop: `compact` shrinks the gauge SVG
// to ~64px so three gauges fit in the rail's ~280px width without
// overflow; `default` preserves the original ~80px size for older
// callers (none today, but keeps the API safe).

import type { CSSProperties } from "react";

export interface GaugeInput {
  count: number;
  total: number;
  label: string;
  /** Stroke colour for the filled arc. Falls back to a sensible default
   *  per label position if omitted. */
  color?: string;
}

const DEFAULT_COLORS = ["#2563eb", "#16a34a", "#7c3aed"]; // blue / green / violet

interface Props {
  gauges: GaugeInput[];
  size?: "default" | "compact";
}

export function ServiceProgressMeters({ gauges, size = "default" }: Props) {
  if (gauges.length === 0) return null;
  // Compact mode is engaged when explicitly asked OR when there are
  // three gauges to render (more than two needs the smaller diameter to
  // stay readable inside the right rail).
  const effectiveSize = size === "compact" || gauges.length >= 3 ? "compact" : "default";

  // Use auto-fit columns so the layout flexes gracefully if the rail
  // narrows; min column width keeps labels from wrapping awkwardly.
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${gauges.length}, minmax(0, 1fr))`,
  };

  return (
    <div className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Progress
      </h3>
      <div className="grid gap-2" style={gridStyle}>
        {gauges.map((g, i) => (
          <ProgressMeter
            key={g.label}
            count={g.count}
            total={g.total}
            label={g.label}
            color={g.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            variant={effectiveSize}
          />
        ))}
      </div>
    </div>
  );
}

function ProgressMeter({
  count,
  total,
  label,
  color,
  variant,
}: {
  count: number;
  total: number;
  label: string;
  color: string;
  variant: "default" | "compact";
}) {
  // Compact = 64px outer / 24 radius / 6 stroke / 14px count text.
  // Default = 80px outer / 35 radius / 8 stroke / 20px count text.
  const isCompact = variant === "compact";
  const dim = isCompact ? 64 : 80;
  const radius = isCompact ? 24 : 35;
  const strokeWidth = isCompact ? 6 : 8;
  const fontSize = isCompact ? 14 : 20;
  const center = dim / 2;
  const dashTotal = 2 * Math.PI * radius;
  const pct = total > 0 ? Math.max(0, Math.min(1, count / total)) : 0;
  const dash = pct * dashTotal;
  return (
    <div className="flex flex-col items-center">
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        role="img"
        aria-label={`${label}: ${count} of ${total}`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${dashTotal}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
        <text
          x={center}
          y={center + (isCompact ? 4 : 6)}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="700"
          fill="#0f172a"
        >
          {count}/{total}
        </text>
      </svg>
      <span
        className={`mt-1 font-medium uppercase tracking-wide text-gray-500 ${
          isCompact ? "text-[10px]" : "text-xs"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
