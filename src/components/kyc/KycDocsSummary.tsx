"use client";

// B-076 — shared KYC DOCUMENTS status box. Lifted from
// `PerPersonReviewWizard`'s persistent progress strip so admin's
// per-profile view can render the same widget. The status legend is
// emitted via the existing `DocumentStatusLegend` component.
//
// Visual:
//   [ FileText ] KYC DOCUMENTS · 3 of 9 uploaded
//   ○ IDENTITY (3/3)  ◔ FINANCIAL (0/5)  ✓ COMPLIANCE (0/1)   <legend …>

import { CheckCircle2, FileText } from "lucide-react";
import { DocumentStatusLegend } from "@/components/shared/DocumentStatusLegend";

export interface KycDocsSummaryCategory {
  /** Stable category key (matches `document_types.category`). */
  key: string;
  /** Display label, already title-cased (e.g. "Identity"). */
  label: string;
  uploaded: number;
  total: number;
}

export interface KycDocsSummaryProps {
  uploadCount: number;
  totalCount: number;
  byCategory: KycDocsSummaryCategory[];
  /** Hide the legend strip when caller wants a compact summary. Default: true. */
  showLegend?: boolean;
  /** Click a category badge → caller scrolls / navigates to that section. */
  onCategoryClick?: (categoryKey: string) => void;
}

function categoryIcon(uploaded: number, total: number) {
  if (total === 0) return null;
  if (uploaded === 0) return <span className="text-gray-300">○</span>;
  if (uploaded < total) return <span className="text-amber-500">◔</span>;
  return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
}

export function KycDocsSummary({
  uploadCount,
  totalCount,
  byCategory,
  showLegend = true,
  onCategoryClick,
}: KycDocsSummaryProps) {
  if (totalCount === 0) return null;
  return (
    <div className="rounded-lg border bg-white px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
      <p className="text-[11px] text-gray-600 font-semibold uppercase tracking-wide flex items-center gap-1.5">
        <FileText className="h-3 w-3" />
        KYC Documents
        <span
          className={`ml-1 text-[11px] font-medium normal-case tracking-normal ${
            uploadCount === totalCount ? "text-green-600" : "text-amber-600"
          }`}
        >
          · {uploadCount} of {totalCount} uploaded
        </span>
      </p>
      <div className="flex items-center gap-x-4 gap-y-2 text-xs text-gray-600 flex-wrap">
        {byCategory.map((c) => {
          if (c.total === 0) return null;
          const content = (
            <>
              {categoryIcon(c.uploaded, c.total)}
              <span className="font-medium uppercase tracking-wide text-[10px] text-gray-700">
                {c.label}
              </span>
              <span className="tabular-nums">
                ({c.uploaded}/{c.total})
              </span>
            </>
          );
          if (onCategoryClick) {
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onCategoryClick(c.key)}
                className="inline-flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label={`Jump to ${c.label} documents`}
              >
                {content}
              </button>
            );
          }
          return (
            <span key={c.key} className="inline-flex items-center gap-1.5">
              {content}
            </span>
          );
        })}
        {showLegend && <DocumentStatusLegend />}
      </div>
    </div>
  );
}
