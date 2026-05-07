"use client";

// B-076 — grouped per-category doc list. Lifted from
// `PerPersonReviewWizard.renderAllDocsContent` so admin's per-profile
// view in `/admin/services/[id]` Step 4 can render the same grouped
// IDENTITY / FINANCIAL / COMPLIANCE sections.
//
// Each category renders a card with header (label + N of M uploaded)
// and a divided list of `KycDocRow`s.

import { KycDocRow, type KycDocRowData } from "./KycDocRow";

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
        const total = cat.docs.length;
        const uploaded = cat.docs.filter((d) => d.is_uploaded).length;
        const complete = total > 0 && uploaded === total;
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
                    complete ? "text-green-600" : "text-amber-600"
                  }`}
                >
                  {uploaded} of {total} uploaded
                </span>
              </div>
              <div className="divide-y">
                {cat.docs.map((d) => (
                  <KycDocRow
                    key={d.document_type_id}
                    doc={d}
                    showAdminControls={showAdminControls}
                    onViewClick={onViewClick}
                    onUploadClick={onUploadClick}
                    isUploading={uploadingDocTypeId === d.document_type_id}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
