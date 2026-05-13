"use client";

// B-076 — grouped per-category doc list. Lifted from
// `PerPersonReviewWizard.renderAllDocsContent` so admin's per-profile
// view in `/admin/services/[id]` Step 4 can render the same grouped
// IDENTITY / FINANCIAL / COMPLIANCE sections.
//
// Each category renders a card with header (label + N of M uploaded)
// and a divided list of `KycDocRow`s.
//
// B-107 — admin gains a per-row Waive / Un-waive action when the
// caller passes `serviceId`, `profileId`, `waivers`, and
// `onWaiversChange`. Without them (e.g. client wizard mounts) the
// action stays hidden. Waive flows through the shared
// `src/lib/waivers/clientActions.ts` helper so behaviour matches
// `KycDocumentsTable` exactly.

import { useState } from "react";
import { Ban, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KycDocRow, type KycDocRowData } from "./KycDocRow";
import {
  waiveDocument,
  unwaiveDocument,
} from "@/lib/waivers/clientActions";
import type { WaivedDocumentRequirement } from "@/app/(admin)/admin/services/[id]/page";

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
  /** B-107 — admin waive controls. All three must be set to render the
   *  per-row Waive / Un-waive button; missing any one suppresses the
   *  affordance entirely (used to keep client-wizard mounts read-only). */
  serviceId?: string;
  profileId?: string;
  waivers?: WaivedDocumentRequirement[];
  onWaiversChange?: (next: WaivedDocumentRequirement[]) => void;
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
  serviceId,
  profileId,
  waivers,
  onWaiversChange,
}: KycDocsByCategoryProps) {
  // B-107 — Waive / un-waive UI state. Only used when the caller wired
  // the four waive props above; otherwise the affordances stay hidden.
  const [waivingTypeId, setWaivingTypeId] = useState<string | null>(null);
  const [waiveConfirm, setWaiveConfirm] = useState<{
    documentTypeId: string;
    documentName: string;
  } | null>(null);
  const canWaive = !!(serviceId && profileId && waivers && onWaiversChange);

  async function handleWaive(documentTypeId: string) {
    if (!canWaive) return;
    setWaivingTypeId(documentTypeId);
    try {
      await waiveDocument({
        serviceId: serviceId!,
        profileId: profileId!,
        documentTypeId,
        prev: waivers!,
        onChange: onWaiversChange!,
      });
    } finally {
      setWaivingTypeId(null);
    }
  }

  async function handleUnwaive(documentTypeId: string) {
    if (!canWaive) return;
    setWaivingTypeId(documentTypeId);
    try {
      await unwaiveDocument({
        serviceId: serviceId!,
        profileId: profileId!,
        documentTypeId,
        prev: waivers!,
        onChange: onWaiversChange!,
      });
    } finally {
      setWaivingTypeId(null);
    }
  }

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
                        className="flex items-center justify-between px-5 py-3 bg-gray-50/70 gap-3"
                      >
                        <span className="text-sm text-gray-500 italic truncate">
                          {d.document_name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
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
                          {canWaive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1 text-gray-500 hover:text-brand-navy"
                              disabled={waivingTypeId === d.document_type_id}
                              onClick={() => void handleUnwaive(d.document_type_id)}
                            >
                              {waivingTypeId === d.document_type_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Un-waive
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={d.document_type_id}
                      className="flex items-stretch justify-between gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <KycDocRow
                          doc={d}
                          showAdminControls={showAdminControls}
                          onViewClick={onViewClick}
                          onUploadClick={onUploadClick}
                          isUploading={uploadingDocTypeId === d.document_type_id}
                        />
                      </div>
                      {canWaive && (
                        <div className="pr-3 shrink-0 flex items-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs gap-1 text-gray-500 hover:text-brand-navy"
                            disabled={waivingTypeId === d.document_type_id}
                            onClick={() =>
                              setWaiveConfirm({
                                documentTypeId: d.document_type_id,
                                documentName: d.document_name,
                              })
                            }
                          >
                            {waivingTypeId === d.document_type_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Ban className="h-3 w-3" />
                            )}
                            Waive
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* B-107 — Waive confirmation dialog. Mirrors KycDocumentsTable's
          wording; un-waive is single-click reversal so no confirm. */}
      <Dialog
        open={waiveConfirm !== null}
        onOpenChange={(o) => { if (!o) setWaiveConfirm(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive this document?</DialogTitle>
          </DialogHeader>
          {waiveConfirm && (
            <p className="text-sm text-gray-600">
              The client will no longer be asked to upload{" "}
              <span className="font-semibold">{waiveConfirm.documentName}</span>.
              You can un-waive it at any time.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaiveConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="bg-brand-navy hover:bg-brand-navy/90 text-white"
              onClick={() => {
                if (!waiveConfirm) return;
                const target = waiveConfirm;
                setWaiveConfirm(null);
                void handleWaive(target.documentTypeId);
              }}
            >
              Waive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
