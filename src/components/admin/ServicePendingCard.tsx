"use client";

// B-111 Batch 2 — Pending card. One-glance list of every actionable item
// on the service, sorted critical → warning → info. Each row is a button
// — click drills to the relevant section / profile / document / alert.
//
// Pure UI: takes pre-derived `PendingItem[]` (from
// `src/lib/services/computePendingItems.ts`) and an `onAction` callback
// for click routing. The parent (`ServiceDetailClient`) wires the
// callback to scroll / open-dialog / expand actions.

import type { PendingItem } from "@/lib/services/computePendingItems";
import { cn } from "@/lib/utils";

const SEVERITY_DOT: Record<PendingItem["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const SEVERITY_RING: Record<PendingItem["severity"], string> = {
  critical: "ring-red-200",
  warning: "ring-amber-200",
  info: "ring-blue-200",
};

const COUNT_PILL_BG: Record<PendingItem["severity"], string> = {
  critical: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
};

export function ServicePendingCard({
  items,
  onAction,
}: {
  items: PendingItem[];
  onAction: (item: PendingItem) => void;
}) {
  const total = items.length;
  // Top-tier counter for the header pill. Mirrors how Alerts surfaces
  // total open + tracks the highest severity to flag urgency.
  const topSeverity: PendingItem["severity"] = items[0]?.severity ?? "info";

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Pending
        </h3>
        {total > 0 ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
              COUNT_PILL_BG[topSeverity],
            )}
          >
            {total}
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
            0
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-500 italic">
          All clear — nothing pending.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto -mr-1 pr-1">
          {items.map((item) => (
            <PendingRow key={item.id} item={item} onAction={onAction} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingRow({
  item,
  onAction,
}: {
  item: PendingItem;
  onAction: (item: PendingItem) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onAction(item)}
        className="group w-full text-left rounded-md border border-gray-100 bg-white px-3 py-2 hover:bg-gray-50 hover:border-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "mt-1 h-2 w-2 shrink-0 rounded-full ring-2",
              SEVERITY_DOT[item.severity],
              SEVERITY_RING[item.severity],
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-brand-navy leading-snug">
              {item.label}
            </p>
            {item.detail ? (
              <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                {item.detail}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
