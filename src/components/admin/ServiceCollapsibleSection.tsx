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
  // B-080 introduced `step` as a tight title pill. Subsequent passes
  // widened it: B-081 added progress + RAG, B-082 pulled the Show/Hide
  // chevron inside, B-083 makes the pill a full-width flex container
  // with `justify-between` so the title hugs the left edge and the
  // controls cluster (progress → % → ● Complete → Show ▾) hugs the
  // right edge. SectionReviewBadge + SectionReviewButton remain
  // siblings outside the pill on the row's regular background.
  variant?: "default" | "step";
  /** B-085 — opt-in override for the right-cluster status text. When set,
   *  used in place of the default RAG_LABEL[ragStatus] mapping. Lets the
   *  service-level Documents pill show "Not started" / "Partial" /
   *  "Complete" without affecting other sections' "Incomplete" wording. */
  statusLabelOverride?: string;
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
  statusLabelOverride,
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

  // B-088 — step variant: pill spans the card edge-to-edge (the card IS
  // the pill). SectionReviewControls moves out of the Card and renders as
  // a sibling on the row's background. Anchor moves to the outer wrapper
  // so step-indicator hrefs still resolve to the row.
  if (isStep) {
    return (
      <div id={anchorId} className="flex items-stretch gap-3 scroll-mt-24">
        <Card className="flex-1 overflow-hidden border border-gray-900 shadow-sm">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
          >
            <span className="flex w-full items-center justify-between gap-3 px-5 py-3 bg-[#06629c] text-white text-sm font-medium">
              {/* Left: title pinned to left edge */}
              <span className="inline-flex items-center gap-2 min-w-0">
                {icon && <span className="text-white/80 shrink-0">{icon}</span>}
                <span className="font-medium truncate">{title}</span>
              </span>
              {/* Right cluster: progress → % → ● Complete → Show ▾ */}
              {percentage !== undefined && ragStatus && (
                <span className="inline-flex items-center gap-2.5 shrink-0">
                  <div className={`${sectionKey ? "hidden lg:block" : ""} w-24 h-1.5 rounded-full bg-white/20 overflow-hidden shrink-0`}>
                    <div
                      className={`h-full rounded-full transition-all ${fillColor}`}
                      style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                    />
                  </div>
                  <span className={`${sectionKey ? "hidden lg:inline" : ""} text-xs text-white w-8 text-right shrink-0`}>
                    {percentage}%
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-white shrink-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragStatus]}`} />
                    <span className="hidden sm:inline">{statusLabelOverride ?? RAG_LABEL[ragStatus]}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-white/90 shrink-0">
                    {open ? "Hide" : "Show"}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                  </span>
                </span>
              )}
            </span>
          </button>
          {open && (
            <CardContent className="pt-3 pb-4 px-5 border-t border-gray-100">
              {children}
              {sectionKey && <ConnectedNotesHistory sectionKey={sectionKey} />}
            </CardContent>
          )}
        </Card>
        {sectionKey && (
          <div className="flex items-center shrink-0">
            <SectionReviewControls sectionKey={sectionKey} title={title} />
          </div>
        )}
      </div>
    );
  }

  // Default variant — light header rows (Internal Notes, Risk Assessment,
  // Milestones, Audit Trail). Layout unchanged from B-080..B-083.
  return (
    <Card
      id={anchorId}
      className="overflow-hidden scroll-mt-24 border border-gray-200 shadow-sm"
    >
      <div className="flex items-center px-5 py-4 gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex-1 min-w-0 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors -mx-2 px-2 py-1 rounded gap-3"
        >
          {/* Default variant — title + adminOnly badge on left, progress + RAG on right */}
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
            <span className="font-semibold text-brand-navy truncate">{title}</span>
            {adminOnly && (
              <span className="text-[9px] font-semibold uppercase tracking-wide bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded shrink-0">
                Admin
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 ml-4 shrink-0">
            {percentage !== undefined && ragStatus && (
              <>
                <div className={`${sectionKey ? "hidden lg:block" : ""} w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden`}>
                  <div
                    className={`h-full rounded-full transition-all ${fillColor}`}
                    style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                  />
                </div>
                <span className={`${sectionKey ? "hidden lg:inline" : ""} text-xs text-gray-500 w-8 text-right`}>{percentage}%</span>
                <span className={`inline-flex items-center gap-1 text-xs ${
                  ragStatus === "green" ? "text-green-700" :
                  ragStatus === "amber" ? "text-amber-600" :
                  "text-red-600"
                }`}>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragStatus]}`} />
                  <span className="hidden sm:inline">{statusLabelOverride ?? RAG_LABEL[ragStatus]}</span>
                </span>
              </>
            )}
          </div>

          <div className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors shrink-0 ${open ? "bg-brand-navy" : "bg-gray-200 hover:bg-gray-300"}`}>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180 text-white" : "text-gray-600"}`}
            />
          </div>
        </button>

        {sectionKey && (
          <SectionReviewControls sectionKey={sectionKey} title={title} />
        )}
      </div>

      {open && (
        <CardContent className="pt-3 pb-4 px-5 border-t border-gray-100">
          {children}
          {sectionKey && <ConnectedNotesHistory sectionKey={sectionKey} />}
        </CardContent>
      )}
    </Card>
  );
}

function SectionReviewControls({ sectionKey, title }: { sectionKey: string; title: string }) {
  const { applicationId, currentStatus, onReviewSaved } = useSectionReview(sectionKey);
  return (
    <div className="flex items-center gap-2 shrink-0">
      <SectionReviewBadge status={currentStatus} />
      <SectionReviewButton
        applicationId={applicationId}
        sectionKey={sectionKey}
        sectionLabel={title}
        currentStatus={currentStatus}
        onReviewSaved={onReviewSaved}
      />
    </div>
  );
}
