"use client";

// B-076 — grouped per-category doc list. Lifted from
// `PerPersonReviewWizard.renderAllDocsContent` so admin's per-profile
// view in `/admin/services/[id]` Step 4 can render the same grouped
// IDENTITY / FINANCIAL / COMPLIANCE sections.
//
// Each category renders a card with header (label + N of M uploaded)
// and a divided list of `KycDocRow`s.

import { KycDocRow, type KycDocRowData } from "./KycDocRow";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface KycDocsCategory {
  /** Stable category key (matches `document_types.category`). */
  key: string;
  /** Already title-cased (e.g. "Identity"). The header reads "{label} Documents". */
  label: string;
  docs: KycDocRowData[];
}

export interface KycDocsByCategoryProps {
  categories: KycDocsCategory[];
  /** Forwarded to every `KycDocRow`. */
  showAdminControls?: boolean;
  onViewClick?: (docId: string) => void;
  onUploadClick?: (docTypeId: string) => void;
  /** When set, this docTypeId currently has an in-flight upload. */
  uploadingDocTypeId?: string | null;
  /** Optional anchor prefix for in-page nav (`<id>-cat-<key>`). */
  anchorPrefix?: string;
}

function waivedTooltipText(waivedAt: string | null | undefined, waivedByName?: string | null) {
  if (!waivedAt) return "Waived";
  const date = new Date(waivedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return waivedByName ? `Waived on ${date} by ${waivedByName}` : `Waived on ${date}`;
}

export function KycDocsByCategory({
  categories,
  showAdminControls = false,
  onViewClick,
  onUploadClick,
  uploadingDocTypeId,
  anchorPrefix = "docs",
}: KycDocsByCategoryProps) {
  if (categories.length === 0) return null;
  return (
    <div className="space-y-4">
      {categories.map((cat) => {
        // B-106 — exclude waived rows from both numerator and denominator
        // so the header reads "N of M uploaded" against required-only docs.
        const requiredDocs = cat.docs.filter((d) => !d.is_waived);
        const total = requiredDocs.length;
        const uploaded = requiredDocs.filter((d) => d.is_uploaded).length;
        const complete = total > 0 && uploaded === total;
        const waivedInCat = cat.docs.filter((d) => d.is_waived).length;
        return (
          <div
            key={cat.key}
            id={`${anchorPrefix}-cat-${cat.key}`}
            className="scroll-mt-4"
          >
            <div className="border rounded-xl bg-white">
              <div className="px-5 py-3 border-b flex items-center justify-between">
                <p className="text-sm font-semibold text-brand-navy uppercase tracking-wide">
                  {cat.label} Documents
                </p>
                <span
                  className={`text-xs font-medium ${
                    total === 0 ? "text-gray-500" : complete ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {uploaded} of {total} uploaded
                  {waivedInCat > 0 && (
                    <span className="text-gray-500"> · {waivedInCat} waived</span>
                  )}
                </span>
              </div>
              <div className="divide-y">
                {cat.docs.map((d) => {
                  if (d.is_waived) {
                    return (
                      <div
                        key={d.document_type_id}
                        className="flex items-center justify-between px-5 py-3 bg-gray-50/70"
                      >
                        <span className="text-sm text-gray-500 italic truncate">
                          {d.document_name}
                        </span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span
                                  className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 italic cursor-help"
                                  aria-label={waivedTooltipText(d.waived_at, d.waived_by_name)}
                                >
                                  Waived
                                </span>
                              }
                            />
                            <TooltipContent>
                              {waivedTooltipText(d.waived_at, d.waived_by_name)}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    );
                  }
                  return (
                    <KycDocRow
                      key={d.document_type_id}
                      doc={d}
                      showAdminControls={showAdminControls}
                      onViewClick={onViewClick}
                      onUploadClick={onUploadClick}
                      isUploading={uploadingDocTypeId === d.document_type_id}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
