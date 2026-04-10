"use client";

import Link from "next/link";
import { CheckCircle, AlertTriangle, Circle } from "lucide-react";

export interface ChecklistSection {
  label: string;
  filled: number;
  total: number;
  href: string;
}

interface CompletionChecklistProps {
  sections: ChecklistSection[];
}

function SectionRow({ section }: { section: ChecklistSection }) {
  const pct = section.total > 0 ? Math.round((section.filled / section.total) * 100) : 0;
  const complete = section.filled === section.total && section.total > 0;
  const started = section.filled > 0;

  return (
    <Link
      href={section.href}
      className="flex items-center justify-between py-2.5 hover:bg-gray-50 rounded px-2 -mx-2 transition-colors group"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {complete ? (
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        ) : started ? (
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-gray-300 shrink-0" />
        )}
        <span className={`text-sm truncate ${complete ? "text-gray-700" : started ? "text-gray-700" : "text-gray-400"}`}>
          {section.label}
        </span>
      </div>
      <span className={`text-xs shrink-0 ml-2 tabular-nums ${complete ? "text-green-600" : started ? "text-amber-600" : "text-gray-400"}`}>
        {section.filled}/{section.total}
        {pct > 0 && pct < 100 && ` (${pct}%)`}
      </span>
    </Link>
  );
}

export function CompletionChecklist({ sections }: CompletionChecklistProps) {
  const totalFilled = sections.reduce((s, sec) => s + sec.filled, 0);
  const totalItems = sections.reduce((s, sec) => s + sec.total, 0);
  const overallPct = totalItems > 0 ? Math.round((totalFilled / totalItems) * 100) : 0;

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-brand-navy">Your Progress</h3>
        <span className="text-xs text-gray-500">{overallPct}% complete</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mb-4">
        <div
          className="h-full rounded-full bg-brand-accent transition-all"
          style={{ width: `${overallPct}%` }}
        />
      </div>
      <div className="divide-y">
        {sections.map((s) => (
          <SectionRow key={s.label} section={s} />
        ))}
      </div>
    </div>
  );
}
