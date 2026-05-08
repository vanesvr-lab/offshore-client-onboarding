"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionReviewBadge } from "./SectionReviewBadge";
import { SectionReviewButton } from "./SectionReviewButton";
import { ConnectedNotesHistory, useSectionReview } from "./AdminApplicationSections";

type RagStatus = "green" | "amber" | "red";

interface Props {
  title: string;
  icon?: React.ReactNode;
  percentage?: number;
  ragStatus?: RagStatus;
  defaultOpen?: boolean;
  adminOnly?: boolean;
  // B-073 — when provided, renders SectionReviewBadge + SectionReviewButton in
  // the header (visible even when collapsed) and ConnectedNotesHistory at the
  // bottom of the expanded body. Section-review affordances require an
  // ancestor <AdminApplicationSectionsProvider>.
  sectionKey?: string;
  anchorId?: string;
  // B-079 — `step` paints the header as a solid #06629c band with a black
  // outer border, compact px-4/py-2 padding, white text, and an explicit
  // Hide/Show affordance. Other call sites (Internal Notes, Risk Assessment,
  // Milestones, Audit Trail) keep the default light treatment.
  variant?: "default" | "step";
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
  sectionKey,
  anchorId,
  variant = "default",
  children,
}: Props) {
  // Default open if not complete
  const autoOpen = defaultOpen ?? (ragStatus !== "green");
  const [open, setOpen] = useState(autoOpen);

  const fillColor =
    ragStatus === "green" ? "bg-green-500" :
    ragStatus === "amber" ? "bg-amber-400" :
    "bg-red-500";

  const isStep = variant === "step";

  // RAG label color: white-tinted on the navy band, original tones on the
  // default light header.
  const ragTextClass = isStep
    ? "text-white"
    : ragStatus === "green" ? "text-green-700"
    : ragStatus === "amber" ? "text-amber-600"
    : "text-red-600";

  return (
    <Card
      id={anchorId}
      className={
        isStep
          ? "overflow-hidden scroll-mt-24 border-2 border-gray-900 shadow-sm"
          : "overflow-hidden scroll-mt-24 border border-gray-200 shadow-sm"
      }
    >
      <div
        className={
          isStep
            ? "flex items-center bg-[#06629c] text-white px-4 py-2 gap-2"
            : "flex items-center px-5 py-4 gap-2"
        }
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={
            isStep
              ? "flex-1 min-w-0 flex items-center justify-between text-left hover:bg-white/5 transition-colors -mx-2 px-2 py-1 rounded"
              : "flex-1 min-w-0 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors -mx-2 px-2 py-1 rounded"
          }
        >
          {/* Left: icon + title + admin badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className={isStep ? "text-white/80 shrink-0" : "text-gray-400 shrink-0"}>
                {icon}
              </span>
            )}
            <span
              className={
                isStep
                  ? "font-semibold text-white truncate"
                  : "font-semibold text-brand-navy truncate"
              }
            >
              {title}
            </span>
            {adminOnly && (
              <span
                className={
                  isStep
                    ? "text-[9px] font-semibold uppercase tracking-wide bg-white/15 text-white border border-white/30 px-1.5 py-0.5 rounded shrink-0"
                    : "text-[9px] font-semibold uppercase tracking-wide bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded shrink-0"
                }
              >
                Admin
              </span>
            )}
          </div>

          {/* Right: progress + RAG + Hide/Show + chevron */}
          <div className="flex items-center gap-3 ml-4 shrink-0">
            {percentage !== undefined && ragStatus && (
              <>
                {/* Mini progress bar — desktop only, hidden when sectionKey
                    is wired so the review badge has room on narrow viewports */}
                <div
                  className={`${sectionKey ? "hidden lg:block" : ""} w-24 h-1.5 rounded-full ${
                    isStep ? "bg-white/20" : "bg-gray-200"
                  } overflow-hidden`}
                >
                  <div
                    className={`h-full rounded-full transition-all ${fillColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                  />
                </div>
                <span
                  className={`${sectionKey ? "hidden lg:inline" : ""} text-xs ${
                    isStep ? "text-white/80" : "text-gray-500"
                  } w-8 text-right`}
                >
                  {percentage}%
                </span>
                <span className={`inline-flex items-center gap-1 text-xs ${ragTextClass}`}>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragStatus]}`} />
                  <span className="hidden sm:inline">{RAG_LABEL[ragStatus]}</span>
                </span>
              </>
            )}
            {isStep && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/80">
                {open ? "Hide" : "Show"}
              </span>
            )}
            <div
              className={
                isStep
                  ? "h-6 w-6 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 transition-colors"
                  : `h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
                      open ? "bg-brand-navy" : "bg-gray-200 hover:bg-gray-300"
                    }`
              }
            >
              <ChevronDown
                className={
                  isStep
                    ? `h-3.5 w-3.5 text-white transition-transform ${open ? "rotate-180" : ""}`
                    : `h-3.5 w-3.5 transition-transform ${
                        open ? "rotate-180 text-white" : "text-gray-600"
                      }`
                }
              />
            </div>
          </div>
        </button>

        {sectionKey && (
          <SectionReviewControls
            sectionKey={sectionKey}
            title={title}
            tone={isStep ? "on-dark" : "default"}
          />
        )}
      </div>

      {open && (
        <CardContent className={
          isStep
            ? "pt-3 pb-4 px-5"
            : "pt-3 pb-4 px-5 border-t border-gray-100"
        }>
          {children}
          {sectionKey && <ConnectedNotesHistory sectionKey={sectionKey} />}
        </CardContent>
      )}
    </Card>
  );
}

function SectionReviewControls({
  sectionKey,
  title,
  tone = "default",
}: {
  sectionKey: string;
  title: string;
  tone?: "default" | "on-dark";
}) {
  const { applicationId, currentStatus, onReviewSaved } = useSectionReview(sectionKey);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <SectionReviewBadge status={currentStatus} tone={tone} />
      <SectionReviewButton
        applicationId={applicationId}
        sectionKey={sectionKey}
        sectionLabel={title}
        currentStatus={currentStatus}
        onReviewSaved={onReviewSaved}
        tone={tone}
      />
    </div>
  );
}
