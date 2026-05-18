"use client";

// B-125 — Audit Trail right-rail card. Replaces the
// `ServiceCollapsibleSection` wrapper used since B-073, bringing the
// border treatment in line with the rest of the rail
// (`bg-white border rounded-xl px-4 py-3`) and adding three new
// affordances:
//
//   1. Date-range preset chips (Today / 7d / 30d / All time / Custom)
//      — default 30 days. Filtering is client-side; the parent already
//      loads the full list of entries server-side.
//   2. CSV download button — opens
//      `/api/admin/services/[id]/audit-log/export?from=&to=` in a new
//      tab; the server filters by the same window the card is showing.
//   3. Date display rule lives on `AuditTrail` itself: ≤3 days → "Nd
//      ago", older → "12 May 2026".
//
// Existing per-actor and per-action filters (introduced earlier) are
// preserved — date range is the only new filter in this brief.

import { useMemo, useState } from "react";
import { Clock, Download } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AuditTrail } from "./AuditTrail";
import type { AuditLogEntry } from "@/types";
import type { ServiceAuditEntry } from "@/app/(admin)/admin/services/[id]/page";

type Preset = "today" | "7d" | "30d" | "all" | "custom";

interface Props {
  serviceId: string;
  entries: ServiceAuditEntry[];
}

interface Window {
  fromIso: string | null;
  toIso: string | null;
}

// Convert a preset to a {from, to} window. `to` is left null (open) for
// presets that include "up to now"; the CSV endpoint treats null as
// "no upper bound". Custom is handled separately because it carries
// admin-picked dates.
function presetWindow(preset: Preset, customFrom: string, customTo: string): Window {
  const now = new Date();
  if (preset === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { fromIso: start.toISOString(), toIso: null };
  }
  if (preset === "7d") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { fromIso: start.toISOString(), toIso: null };
  }
  if (preset === "30d") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { fromIso: start.toISOString(), toIso: null };
  }
  if (preset === "all") {
    return { fromIso: null, toIso: null };
  }
  // custom — admin's "YYYY-MM-DD" strings, normalised to start/end of
  // day on the From/To anchors so a single-day pick is inclusive.
  const fromIso = customFrom
    ? new Date(`${customFrom}T00:00:00`).toISOString()
    : null;
  const toIso = customTo
    ? new Date(`${customTo}T23:59:59.999`).toISOString()
    : null;
  return { fromIso, toIso };
}

const PRESET_OPTIONS: { value: Exclude<Preset, "custom">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export function ServiceAuditTrailCard({ serviceId, entries }: Props) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [customOpen, setCustomOpen] = useState(false);
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  // Build the active window from the current preset + custom inputs.
  // Memoised so the CSV link recomputes only when filters change.
  const window: Window = useMemo(
    () => presetWindow(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const auditActors = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => e.actor_name).filter(Boolean))) as string[],
    [entries],
  );
  const auditActions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action).filter(Boolean))),
    [entries],
  );

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (actorFilter !== "all" && e.actor_name !== actorFilter) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (window.fromIso && e.created_at < window.fromIso) return false;
      if (window.toIso && e.created_at > window.toIso) return false;
      return true;
    });
  }, [entries, actorFilter, actionFilter, window]);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (window.fromIso) params.set("from", window.fromIso);
    if (window.toIso) params.set("to", window.toIso);
    const qs = params.toString();
    return `/api/admin/services/${serviceId}/audit-log/export${qs ? `?${qs}` : ""}`;
  }, [serviceId, window]);

  const customLabel = preset === "custom"
    ? (customFrom || customTo
        ? `${customFrom || "…"} → ${customTo || "…"}`
        : "Custom")
    : "Custom";

  const hasAnyFilter =
    actorFilter !== "all" || actionFilter !== "all" || preset !== "30d";

  return (
    <div className="bg-white border rounded-xl px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 min-w-0">
          <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider truncate">
            Audit Trail
          </p>
        </div>
        <a
          href={exportUrl}
          // The endpoint sets Content-Disposition: attachment, so a
          // plain anchor download is enough — no JS fetch needed.
          download
          title="Download filtered audit trail as CSV"
          aria-label="Download CSV"
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 shrink-0"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          CSV
        </a>
      </div>

      {/* Date-range preset chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESET_OPTIONS.map((opt) => {
          const active = preset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPreset(opt.value)}
              className={
                "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
                (active
                  ? "bg-brand-blue text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200")
              }
            >
              {opt.label}
            </button>
          );
        })}
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors " +
                  (preset === "custom"
                    ? "bg-brand-blue text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200")
                }
              >
                {customLabel}
              </button>
            }
          />
          <PopoverContent align="end" className="w-60 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Custom range
            </p>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full border rounded-md px-2 py-1 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-500">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full border rounded-md px-2 py-1 text-xs"
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setCustomFrom("");
                  setCustomTo("");
                }}
                className="h-7 text-[11px] text-gray-600"
              >
                Clear
              </Button>
              <Button
                onClick={() => {
                  setPreset("custom");
                  setCustomOpen(false);
                }}
                className="h-7 text-[11px]"
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Existing per-actor / per-action filters preserved. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">By user:</span>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="border rounded px-1.5 py-0.5 text-[11px] max-w-[120px]"
          >
            <option value="all">All</option>
            {auditActors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border rounded px-1.5 py-0.5 text-[11px] max-w-[140px]"
          >
            <option value="all">All</option>
            {auditActions.map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => {
              setActorFilter("all");
              setActionFilter("all");
              setPreset("30d");
              setCustomFrom("");
              setCustomTo("");
            }}
            className="text-[11px] text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No audit events for this service yet.</p>
      ) : filteredEntries.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No events match the current filter.</p>
      ) : (
        <AuditTrail entries={filteredEntries as unknown as AuditLogEntry[]} />
      )}
    </div>
  );
}
