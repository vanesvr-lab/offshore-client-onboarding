"use client";

import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldOff,
  Clock,
  UserCheck,
  UserX,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

/**
 * Compact collapsible legend explaining the two-track document status icons.
 * Shown below "Please upload your documents here" on the client KYC review screen.
 */
export function DocumentStatusLegend({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="text-[11px] text-gray-600">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-gray-600 hover:text-brand-navy transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-medium">Status legend</span>
      </button>

      {open && (
        <div className="mt-1.5 rounded-md border bg-gray-50 p-2 space-y-1.5">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <LegendItem icon={<ShieldCheck className="h-3 w-3 text-emerald-600" />} label="AI verified" />
            <LegendItem icon={<ShieldAlert className="h-3 w-3 text-amber-600" />} label="AI flagged" />
            <LegendItem icon={<ShieldQuestion className="h-3 w-3 text-amber-600" />} label="Needs review" />
            <LegendItem icon={<Loader2 className="h-3 w-3 text-blue-600 animate-spin" />} label="AI checking" />
            <LegendItem icon={<ShieldOff className="h-3 w-3 text-gray-400" />} label="AI skipped" />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-gray-200 pt-1.5">
            <LegendItem icon={<UserCheck className="h-3 w-3 text-emerald-600" />} label="Admin approved" />
            <LegendItem icon={<UserX className="h-3 w-3 text-red-600" />} label="Admin rejected" />
            <LegendItem icon={<Clock className="h-3 w-3 text-orange-500" />} label="Pending admin review" />
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {icon}
      <span className="text-[11px] text-gray-600">{label}</span>
    </span>
  );
}

export default DocumentStatusLegend;
