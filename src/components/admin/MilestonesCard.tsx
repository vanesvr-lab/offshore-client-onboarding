"use client";

// B-124 — Milestones card redesign. Three side-by-side cells (LOE / INV
// / PAY) replace the row-per-milestone layout from B-119. Each cell
// shows ✓ + short date when set or em-dash when unset; clicking a cell
// opens an inline popover with a date picker + Clear button.
//
// Wrapper matches the rest of the right rail (`bg-white border
// rounded-xl px-4 py-3`) so it stops looking like a visual outlier
// next to Status / Pending / Communications.
//
// B-125 — labels spelled out ("Letter of Engagement" / "Invoice" /
// "Payment Received") instead of the LOE / INV / PAY abbreviations, the
// date always shows the year ("12 May 2026"), and a small Calendar icon
// sits next to the date as a visual editability cue. Cells are ~93px
// wide at the rail's typical width so the label is allowed to wrap to
// two lines (`whitespace-normal break-words`); the date row stays
// single-line.

import { useState } from "react";
import { Calendar, Check, Loader2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

// Brief explicitly carves the LOE / INV / PAY trio out of any other
// milestones the data model might carry. Adding more here later means
// either adding columns or switching to a vertical layout.
export type MilestoneField =
  | "loe_received_at"
  | "invoice_sent_at"
  | "payment_received_at";

export interface MilestoneCellInput {
  label: string;
  field: MilestoneField;
  /** ISO string when set; null when not yet hit. */
  date: string | null;
}

interface Props {
  cells: MilestoneCellInput[];
  /** Field currently saving (for the per-cell loader). null when idle. */
  savingField: MilestoneField | null;
  /** Caller persists the date (ISO or null to clear). */
  onSave: (field: MilestoneField, isoDate: string | null) => Promise<void>;
}

/** Short "12 May 2026" — year is always shown after B-125 so admins
 *  can tell a milestone last touched this year apart from one set in a
 *  prior cycle without hovering for the tooltip. */
function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** ISO → "YYYY-MM-DD" for a <input type="date"> value. */
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function MilestonesCard({ cells, savingField, onSave }: Props) {
  return (
    <div className="bg-white border rounded-xl px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Milestones
      </p>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((cell) => (
          <MilestoneCell
            key={cell.field}
            cell={cell}
            busy={savingField === cell.field}
            onSave={(iso) => onSave(cell.field, iso)}
          />
        ))}
      </div>
    </div>
  );
}

function MilestoneCell({
  cell,
  busy,
  onSave,
}: {
  cell: MilestoneCellInput;
  busy: boolean;
  onSave: (isoDate: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const isSet = cell.date != null;

  async function setToToday() {
    await onSave(new Date().toISOString());
    setOpen(false);
  }

  async function setToDate(value: string) {
    if (!value) return;
    await onSave(new Date(value).toISOString());
    setOpen(false);
  }

  async function clear() {
    await onSave(null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={busy}
            title={cell.label}
            aria-label={`${cell.label}${
              isSet ? ` set on ${formatShortDate(cell.date!)}` : " not set"
            }`}
            className={
              "flex flex-col items-center gap-1 rounded-md px-2 py-1.5 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed " +
              (isSet
                ? "bg-emerald-50/60 hover:bg-emerald-100/60"
                : "hover:bg-gray-50")
            }
          />
        }
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 leading-tight whitespace-normal break-words">
          {cell.label}
        </span>
        <span
          className={
            "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap " +
            (isSet ? "text-emerald-700" : "text-gray-300")
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isSet ? (
            <>
              <Check className="h-3 w-3 text-emerald-600 shrink-0" />
              <Calendar className="h-3 w-3 text-gray-400 shrink-0" aria-hidden="true" />
              {formatShortDate(cell.date!)}
            </>
          ) : (
            <>
              <Calendar className="h-3 w-3 text-gray-300 shrink-0" aria-hidden="true" />
              —
            </>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-56 space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {cell.label}
          </p>
          {isSet && (
            <p className="text-xs text-gray-600 mt-0.5">
              Currently {formatShortDate(cell.date!)}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-500">Set date</label>
          <input
            type="date"
            defaultValue={toDateInputValue(cell.date)}
            onChange={(e) => void setToDate(e.target.value)}
            disabled={busy}
            className="w-full border rounded-md px-2 py-1 text-xs"
          />
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 border-t">
          <Button
            variant="outline"
            onClick={() => void setToToday()}
            disabled={busy}
            className="h-7 text-[11px] flex-1"
          >
            Mark today
          </Button>
          {isSet && (
            <Button
              variant="outline"
              onClick={() => void clear()}
              disabled={busy}
              className="h-7 text-[11px] text-gray-600"
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
