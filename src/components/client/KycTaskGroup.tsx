"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, AlertTriangle, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";

export interface KycChildTask {
  id: string;
  name: string; // person name or fallback role label
  description: string;
  status: "pending" | "in_progress" | "done";
}

interface KycTaskGroupProps {
  tasks: KycChildTask[];
}

/**
 * Collapsible KYC task group for the dashboard "Your Next Steps" card.
 * If there is only one task, renders as a single non-expandable row.
 */
export function KycTaskGroup({ tasks }: KycTaskGroupProps) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) return null;

  const allDone = tasks.every((c) => c.status === "done");
  const pendingCount = tasks.filter((c) => c.status !== "done").length;

  // Single record — render flat
  if (tasks.length === 1) {
    const task = tasks[0];
    return (
      <Link
        href="/kyc"
        className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-50 transition-colors group"
      >
        <div className="shrink-0">
          {task.status === "done" ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : task.status === "in_progress" ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : (
            <Circle className="h-5 w-5 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.status === "done" ? "text-gray-400 line-through" : "text-brand-navy"}`}>
            Complete KYC — {task.name}
          </p>
          <p className="text-xs text-gray-500 truncate">{task.description}</p>
        </div>
        {task.status !== "done" && (
          <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-brand-blue shrink-0" />
        )}
      </Link>
    );
  }

  // Multiple records — expandable group
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="shrink-0">
          {allDone ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : pendingCount > 0 ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : (
            <Circle className="h-5 w-5 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${allDone ? "text-gray-400 line-through" : "text-brand-navy"}`}>
            Complete KYC — {pendingCount > 0 ? `${pendingCount} profile${pendingCount > 1 ? "s" : ""} need attention` : "All profiles complete"}
          </p>
          <p className="text-xs text-gray-500">{tasks.length} profiles</p>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="ml-8 border-l border-gray-100 pl-3 space-y-0.5 mb-1">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href="/kyc"
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors group"
            >
              <div className="shrink-0">
                {task.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : task.status === "in_progress" ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${task.status === "done" ? "text-gray-400 line-through" : "text-brand-navy"}`}>
                  {task.name}
                </p>
                <p className="text-xs text-gray-400 truncate">{task.description}</p>
              </div>
              {task.status !== "done" && (
                <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-brand-blue shrink-0" />
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
