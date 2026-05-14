"use client";

// B-113 Batch 3 — per-profile "Pending (N)" button + popover. Mounts on
// each profile's header (Quick Actions row). Receives pre-computed
// items from the parent (see `computeProfilePendingItems` in
// `src/lib/services/computePendingItems.ts`) and hands clicks back via
// `onAction`, which the page wires to the same handler the service-level
// `ServicePendingCard` uses (scroll / open-doc / etc.).
//
// Hidden completely when `items.length === 0` so a clean profile keeps
// the header strip uncluttered.

import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { PendingItem } from "@/lib/services/computePendingItems";
import { cn } from "@/lib/utils";

const SEVERITY_DOT: Record<PendingItem["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

interface Props {
  items: PendingItem[];
  onAction: (item: PendingItem) => void;
}

export function ProfilePendingButton({ items, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside-click + Escape so the popover behaves like a real
  // dismissible surface without pulling in a popover primitive.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <AlertCircle className="h-3 w-3" />
        Pending ({items.length})
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Pending for this profile"
          className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border bg-white p-3 shadow-lg"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Pending for this profile
          </p>
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAction(item);
                    setOpen(false);
                  }}
                  className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      SEVERITY_DOT[item.severity],
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-brand-navy leading-snug">
                      {item.label}
                    </span>
                    {item.detail ? (
                      <span className="mt-0.5 block text-[11px] text-gray-500 line-clamp-2">
                        {item.detail}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
