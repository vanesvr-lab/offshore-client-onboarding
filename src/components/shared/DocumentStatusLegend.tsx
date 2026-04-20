"use client";

import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldOff,
  Clock,
  UserCheck,
  UserX,
  Loader2,
} from "lucide-react";

/**
 * Compact single-line legend explaining the two-track document status icons.
 * Always visible, no collapse — kept small enough to fit on one horizontal row.
 */
export function DocumentStatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-600">
      <LegendItem icon={<ShieldCheck className="h-3 w-3 text-emerald-600" />} label="Verified" />
      <LegendItem icon={<ShieldAlert className="h-3 w-3 text-amber-600" />} label="Flagged" />
      <LegendItem icon={<ShieldQuestion className="h-3 w-3 text-amber-600" />} label="Needs review" />
      <LegendItem icon={<Loader2 className="h-3 w-3 text-blue-600 animate-spin" />} label="Checking" />
      <LegendItem icon={<ShieldOff className="h-3 w-3 text-gray-400" />} label="Skipped" />
      <span className="text-gray-300">·</span>
      <LegendItem icon={<UserCheck className="h-3 w-3 text-emerald-600" />} label="Approved" />
      <LegendItem icon={<UserX className="h-3 w-3 text-red-600" />} label="Rejected" />
      <LegendItem icon={<Clock className="h-3 w-3 text-orange-500" />} label="Pending" />
    </div>
  );
}

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
      {icon}
      <span>{label}</span>
    </span>
  );
}

export default DocumentStatusLegend;
