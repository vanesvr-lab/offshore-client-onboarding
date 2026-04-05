import {
  WORKFLOW_STAGES,
  APPLICATION_STATUS_LABELS,
} from "@/lib/utils/constants";
import { formatDateTime } from "@/lib/utils/formatters";
import { Check } from "lucide-react";
import type { ApplicationStatus, Application } from "@/types";

interface StatusTimelineProps {
  application: Application;
}

export function StatusTimeline({ application }: StatusTimelineProps) {
  const stages = WORKFLOW_STAGES;
  const currentIdx = stages.indexOf(application.status as ApplicationStatus);

  const timestamps: Partial<Record<ApplicationStatus, string | null>> = {
    draft: application.created_at,
    submitted: application.submitted_at,
    in_review: application.reviewed_at,
    approved: application.approved_at,
  };

  return (
    <div className="flex items-start">
      {stages.map((stage, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={stage} className="flex flex-col items-center flex-1">
            <div className="flex items-center w-full">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 z-10 shrink-0 mx-auto ${
                  isPast
                    ? "bg-brand-navy border-brand-navy text-white"
                    : isCurrent
                    ? "border-brand-blue bg-brand-blue text-white"
                    : "border-gray-300 bg-white text-gray-400"
                }`}
              >
                {isPast ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-medium">{idx + 1}</span>
                )}
              </div>
              {idx < stages.length - 1 && (
                <div
                  className={`h-0.5 flex-1 ${
                    isPast ? "bg-brand-navy" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
            <div className="mt-2 text-center px-1">
              <p
                className={`text-xs font-medium ${
                  isCurrent
                    ? "text-brand-navy"
                    : isPast
                    ? "text-gray-500"
                    : "text-gray-400"
                }`}
              >
                {APPLICATION_STATUS_LABELS[stage]}
              </p>
              {timestamps[stage] && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDateTime(timestamps[stage])}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
