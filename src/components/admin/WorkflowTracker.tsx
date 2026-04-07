import React from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/types";

const FLOW_STAGES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "pending_action",
  "verification",
  "approved",
];

const NOTCH = 14; // px — chevron point size

interface WorkflowTrackerProps {
  status: ApplicationStatus;
}

export function WorkflowTracker({ status }: WorkflowTrackerProps) {
  const isRejected = status === "rejected";
  const currentIndex = isRejected ? -1 : FLOW_STAGES.indexOf(status);
  const displayStages: ApplicationStatus[] = isRejected
    ? ([...FLOW_STAGES, "rejected"] as ApplicationStatus[])
    : FLOW_STAGES;

  return (
    <div className="flex w-full h-10 items-stretch">
      {displayStages.map((stage, idx) => {
        const isRejectedStage = stage === "rejected";
        const isCompleted = !isRejected && idx < currentIndex;
        const isCurrent =
          (!isRejected && idx === currentIndex) ||
          (isRejected && isRejectedStage);
        const isFuture = !isCompleted && !isCurrent;

        const isFirst = idx === 0;
        const isLast = idx === displayStages.length - 1;

        const clipPath = isFirst
          ? `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%)`
          : isLast
          ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${NOTCH}px 50%)`
          : `polygon(0 0, calc(100% - ${NOTCH}px) 0, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0 100%, ${NOTCH}px 50%)`;

        const zIndex = isCurrent
          ? displayStages.length + 10
          : displayStages.length - idx;

        return (
          <div
            key={stage}
            className={cn("relative flex-1 min-w-0 group", idx > 0 && "-ml-3")}
            style={{
              zIndex,
              // drop-shadow respects clip-path — gives all chevrons a visible outline
              filter: "drop-shadow(0 0 1px rgba(0,0,0,0.13))",
            }}
          >
            {/* Clipped background */}
            <div
              className={cn(
                "absolute inset-0 transition-colors",
                isCompleted && "bg-brand-success",
                isCurrent && !isRejectedStage && "bg-brand-accent",
                isCurrent && isRejectedStage && "bg-brand-danger",
                isFuture && "bg-slate-200"
              )}
              style={{ clipPath }}
            />

            {/* Label */}
            <div
              className={cn(
                "relative h-full flex items-center justify-center gap-1 text-[11px] font-semibold select-none",
                !isFirst && "pl-3",
                isCompleted && "text-white",
                isCurrent && !isRejectedStage && "text-brand-dark",
                isCurrent && isRejectedStage && "text-white",
                isFuture && "text-slate-500"
              )}
            >
              {isCompleted && <CheckIcon className="h-3 w-3 shrink-0" />}
              {isCurrent && isRejectedStage && <XIcon className="h-3 w-3 shrink-0" />}
              <span className="truncate">
                {APPLICATION_STATUS_LABELS[stage]}
              </span>
            </div>

            {/* Hover tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block pointer-events-none z-50">
              <div className="bg-gray-900 text-white text-xs rounded px-2.5 py-1.5 whitespace-nowrap shadow-xl">
                {APPLICATION_STATUS_LABELS[stage]}
                {isCompleted && (
                  <span className="ml-1.5 text-brand-success font-bold">✓ Complete</span>
                )}
                {isCurrent && !isRejectedStage && (
                  <span className="ml-1.5 text-brand-accent font-bold">← Current</span>
                )}
                {isCurrent && isRejectedStage && (
                  <span className="ml-1.5 text-brand-danger font-bold">Rejected</span>
                )}
                {isFuture && (
                  <span className="ml-1.5 text-brand-muted">Pending</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
