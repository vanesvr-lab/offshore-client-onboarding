"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type RagStatus = "green" | "amber" | "red";

interface Props {
  title: string;
  icon?: React.ReactNode;
  percentage?: number;
  ragStatus?: RagStatus;
  defaultOpen?: boolean;
  adminOnly?: boolean;
  children: React.ReactNode;
}

const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

const RAG_LABEL: Record<RagStatus, string> = {
  green: "Complete",
  amber: "Partial",
  red: "Incomplete",
};

export function ServiceCollapsibleSection({
  title,
  icon,
  percentage,
  ragStatus,
  defaultOpen,
  adminOnly = false,
  children,
}: Props) {
  // Default open if not complete
  const autoOpen = defaultOpen ?? (ragStatus !== "green");
  const [open, setOpen] = useState(autoOpen);

  const fillColor =
    ragStatus === "green" ? "bg-green-500" :
    ragStatus === "amber" ? "bg-amber-400" :
    "bg-red-500";

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        {/* Left: icon + title + admin badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
          <span className="font-semibold text-brand-navy truncate">{title}</span>
          {adminOnly && (
            <span className="text-[9px] font-semibold uppercase tracking-wide bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded shrink-0">
              Admin
            </span>
          )}
        </div>

        {/* Right: progress + RAG + chevron */}
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {percentage !== undefined && ragStatus && (
            <>
              {/* Mini progress bar */}
              <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${fillColor}`}
                  style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">{percentage}%</span>
              <span className={`inline-flex items-center gap-1 text-xs ${
                ragStatus === "green" ? "text-green-700" :
                ragStatus === "amber" ? "text-amber-600" :
                "text-red-600"
              }`}>
                <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragStatus]}`} />
                <span className="hidden sm:inline">{RAG_LABEL[ragStatus]}</span>
              </span>
            </>
          )}
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <CardContent className="pt-0 pb-5 px-5 border-t border-gray-100">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
