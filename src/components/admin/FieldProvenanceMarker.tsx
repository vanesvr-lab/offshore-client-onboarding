"use client";

import { useMemo, useState } from "react";
import { Sparkles, PenLine, ShieldOff, Check, Flag, Eye } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { DocumentPreviewDialog } from "@/components/admin/DocumentPreviewDialog";
import {
  normalizeForCompare,
  isEmpty as valueIsEmpty,
} from "@/lib/kyc/normalizeForCompare";
import type { KycFieldType } from "@/lib/kyc/sections";
import type { FieldExtraction, VerificationStatus } from "@/types";

// B-117 — Per-field provenance marker (admin KYC review only).
// Two icon slots next to a field label: left = state (manual / extraction
// available / auto-filled / matches / mismatches), right = action (eye →
// open source doc preview when one exists). The mismatch state opens a
// click-to-fix popover offering the OCR value. B-070's `admin_override`
// pencil branch is removed: an admin edit that matches OCR shows green
// check; an edit that differs shows red flag. The DB still records the
// edit's source as `admin_override` for audit-log integrity — that data
// is no longer the icon's input.

interface SourceDocLite {
  id: string;
  file_name: string;
  mime_type: string | null;
  uploaded_at?: string;
  verification_status?: string;
}

type MatchState =
  | "empty_no_doc"
  | "manual_no_doc"
  | "extraction_skipped"
  | "auto_filled_untouched"
  | "manual_match"
  | "manual_mismatch";

interface Props {
  /** Already filtered to a single profile + field. May include superseded
   *  rows — we still want the original OCR extraction as the baseline. */
  extractions: FieldExtraction[];
  /** Source docs available for this profile, used to resolve doc metadata
   *  for the inline preview. Indexed by `documents.id`. */
  sourceDocs: SourceDocLite[];
  /** Human-readable field label, e.g. "Passport number". Surfaces in the
   *  preview-dialog banner and the click-to-fix popover heading. */
  fieldLabel: string;
  /** Current form value for this field. Drives the match-state decision. */
  currentValue: unknown;
  /** Field type from the KYC schema — drives normalization (date vs text
   *  vs country code, etc.). */
  fieldType: KycFieldType | undefined;
  /** Called when the admin clicks "Use uploaded value" in the click-to-fix
   *  popover. Invoked with the OCR-extracted value (raw string). */
  onApplyValue?: (value: string) => void;
  /** Defensive guard: admin context only. */
  adminContext?: boolean;
}

function pickLatestOcrExtraction(rows: FieldExtraction[]): FieldExtraction | null {
  const ai = rows.filter((r) => r.source === "ai_extraction");
  if (ai.length === 0) return null;
  return ai.reduce((latest, r) =>
    new Date(r.extracted_at) > new Date(latest.extracted_at) ? r : latest,
  );
}

function pickLatestAnyExtraction(rows: FieldExtraction[]): FieldExtraction | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, r) =>
    new Date(r.extracted_at) > new Date(latest.extracted_at) ? r : latest,
  );
}

function computeMatchState({
  extractions,
  sourceDocs,
  currentValue,
  fieldType,
}: {
  extractions: FieldExtraction[];
  sourceDocs: SourceDocLite[];
  currentValue: unknown;
  fieldType: KycFieldType | undefined;
}): MatchState {
  const profileHasAnyDoc = sourceDocs.length > 0;
  const ocrExtraction = pickLatestOcrExtraction(extractions);
  const currentIsEmpty = valueIsEmpty(currentValue);

  if (!profileHasAnyDoc) {
    return currentIsEmpty ? "empty_no_doc" : "manual_no_doc";
  }
  if (!ocrExtraction) {
    return "extraction_skipped";
  }
  if (currentIsEmpty) {
    return "extraction_skipped";
  }
  const ocrValue = ocrExtraction.extracted_value;
  const ocrNorm = normalizeForCompare(ocrValue, fieldType);
  const currentNorm = normalizeForCompare(currentValue, fieldType);
  const normalizedEqual =
    ocrNorm !== null && currentNorm !== null && ocrNorm === currentNorm;
  if (normalizedEqual) {
    const latestAny = pickLatestAnyExtraction(extractions);
    return latestAny?.source === "ai_extraction"
      ? "auto_filled_untouched"
      : "manual_match";
  }
  return "manual_mismatch";
}

function resolveSourceDoc(
  ocrExtraction: FieldExtraction | null,
  sourceDocs: SourceDocLite[],
): SourceDocLite | null {
  if (!ocrExtraction?.source_document_id) return null;
  return sourceDocs.find((d) => d.id === ocrExtraction.source_document_id) ?? null;
}

export function FieldProvenanceMarker({
  extractions,
  sourceDocs,
  fieldLabel,
  currentValue,
  fieldType,
  onApplyValue,
  adminContext = true,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const ocrExtraction = useMemo(
    () => pickLatestOcrExtraction(extractions),
    [extractions],
  );
  const sourceDoc = useMemo(
    () => resolveSourceDoc(ocrExtraction, sourceDocs),
    [ocrExtraction, sourceDocs],
  );

  const matchState = useMemo(
    () =>
      computeMatchState({ extractions, sourceDocs, currentValue, fieldType }),
    [extractions, sourceDocs, currentValue, fieldType],
  );

  if (!adminContext) return null;
  if (matchState === "empty_no_doc") return null;

  // Doc name used in tooltips/popovers; falls back to a generic phrase.
  const docName = sourceDoc?.file_name ?? "the uploaded document";
  const profileHasAnyDoc = sourceDocs.length > 0;
  // For the "no doc + manual" state the tooltip suggests an upload; we
  // don't know the doc type from here, so use a soft prompt.
  const manualNoDocTooltip = `Manually entered. Upload a supporting document to verify.`;
  const extractionSkippedTooltip = sourceDoc
    ? `Could not extract this field from ${sourceDoc.file_name}.`
    : `Could not extract this field from the uploaded document.`;
  const autoFilledTooltip = `Auto-filled from ${docName}.`;
  const matchTooltip = `Matches ${docName}.`;
  const mismatchTooltip =
    ocrExtraction?.extracted_value != null
      ? `Doesn't match ${docName}. Expected: ${ocrExtraction.extracted_value}.`
      : `Doesn't match ${docName}.`;

  // Eye action slot is only relevant when we have a doc to preview.
  const canPreview = !!sourceDoc;
  const showEye = profileHasAnyDoc && canPreview && matchState !== "manual_no_doc";

  // Resolve left-slot icon + classes.
  let LeftIcon: typeof Sparkles | null = null;
  let leftClass = "";
  let leftTooltip = "";
  switch (matchState) {
    case "manual_no_doc":
      LeftIcon = PenLine;
      leftClass = "text-gray-900";
      leftTooltip = manualNoDocTooltip;
      break;
    case "extraction_skipped":
      LeftIcon = ShieldOff;
      leftClass = "text-amber-600";
      leftTooltip = extractionSkippedTooltip;
      break;
    case "auto_filled_untouched":
      LeftIcon = Sparkles;
      leftClass = "text-blue-500";
      leftTooltip = autoFilledTooltip;
      break;
    case "manual_match":
      LeftIcon = Check;
      leftClass = "text-green-600";
      leftTooltip = matchTooltip;
      break;
    case "manual_mismatch":
      LeftIcon = Flag;
      leftClass = "text-red-600";
      leftTooltip = mismatchTooltip;
      break;
  }

  const leftIconNode = LeftIcon ? (
    <LeftIcon className={`h-3 w-3 ${leftClass}`} strokeWidth={2.25} />
  ) : null;

  // Left slot: display-only icon for most states; click-to-fix popover for
  // the mismatch state.
  const leftSlot = (() => {
    if (!LeftIcon) return null;
    if (matchState === "manual_mismatch") {
      return (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={mismatchTooltip}
                className="inline-flex items-center justify-center h-4 w-4 rounded shrink-0 align-middle text-red-600 hover:bg-red-50 cursor-pointer"
              />
            }
          >
            {leftIconNode}
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-2">
              <div className="text-xs text-gray-500">
                OCR extracted from {docName}:
              </div>
              <div className="font-medium text-sm text-gray-900 break-words">
                {ocrExtraction?.extracted_value ?? "—"}
              </div>
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    if (ocrExtraction?.extracted_value != null) {
                      onApplyValue?.(ocrExtraction.extracted_value);
                    }
                    setPopoverOpen(false);
                  }}
                  disabled={!onApplyValue || ocrExtraction?.extracted_value == null}
                >
                  Use uploaded value
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      );
    }
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                aria-label={leftTooltip}
                className={`inline-flex items-center justify-center h-4 w-4 rounded shrink-0 align-middle ${leftClass}`}
              />
            }
          >
            {leftIconNode}
          </TooltipTrigger>
          <TooltipContent>{leftTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  })();

  const eyeSlot = showEye && sourceDoc ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setPreviewOpen(true);
              }}
              aria-label={`Preview ${sourceDoc.file_name}`}
              className="inline-flex items-center justify-center h-4 w-4 rounded shrink-0 align-middle text-blue-500 hover:bg-blue-50 cursor-pointer"
            />
          }
        >
          <Eye className="h-3 w-3" strokeWidth={2.25} />
        </TooltipTrigger>
        <TooltipContent>Preview {sourceDoc.file_name}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  return (
    <>
      {leftSlot}
      {eyeSlot}
      {sourceDoc && (
        <DocumentPreviewDialog
          documentId={sourceDoc.id}
          fileName={sourceDoc.file_name}
          mimeType={sourceDoc.mime_type ?? "application/octet-stream"}
          uploadedAt={sourceDoc.uploaded_at}
          verificationStatus={
            (sourceDoc.verification_status as VerificationStatus | undefined) ?? undefined
          }
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          sourceFieldLabel={fieldLabel}
        />
      )}
    </>
  );
}
