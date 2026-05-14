"use client";

// B-112 — two larger circular gauges (Completed n/5 + Reviewed n/5) that
// sit at the top of `/admin/services/[id]`'s right rail. Pure UI — the
// parent passes pre-derived counts. Counts re-derive immediately after
// a save because the parent feeds them from the live section-reviews
// context (`useSectionReviews`).

interface Props {
  completedCount: number;
  reviewedCount: number;
  total: number;
}

export function ServiceProgressMeters({
  completedCount,
  reviewedCount,
  total,
}: Props) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Progress
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <ProgressMeter
          count={completedCount}
          total={total}
          label="Completed"
          color="#2563eb"
        />
        <ProgressMeter
          count={reviewedCount}
          total={total}
          label="Reviewed"
          color="#16a34a"
        />
      </div>
    </div>
  );
}

function ProgressMeter({
  count,
  total,
  label,
  color,
}: {
  count: number;
  total: number;
  label: string;
  color: string;
}) {
  const dashTotal = 220; // ~2π × 35
  const pct = total > 0 ? Math.max(0, Math.min(1, count / total)) : 0;
  const dash = pct * dashTotal;
  return (
    <div className="flex flex-col items-center">
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        role="img"
        aria-label={`${label}: ${count} of ${total}`}
      >
        <circle
          cx="40"
          cy="40"
          r="35"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        <circle
          cx="40"
          cy="40"
          r="35"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${dashTotal}`}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        <text
          x="40"
          y="46"
          textAnchor="middle"
          fontSize="20"
          fontWeight="700"
          fill="#0f172a"
        >
          {count}/{total}
        </text>
      </svg>
      <span className="mt-1 text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </span>
    </div>
  );
}
