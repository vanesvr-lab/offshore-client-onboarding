"use client";

import { useMemo, useState } from "react";
import { Sparkles, PencilLine } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DocumentPreviewDialog } from "@/components/admin/DocumentPreviewDialog";
import type { FieldExtraction, VerificationStatus } from "@/types";

/**
 * B-070 — Per-field provenance marker for admin KYC views.
 *
 * Renders nothing when the latest extraction for `(profileId, fieldKey)` is
 * `manual` or absent. When `ai_extraction`: small sparkle icon with
 * "Auto-filled from {doc name}" tooltip. When `admin_override`: pencil icon
 * with "Admin override (was: {previous value})". Click → preview dialog.
 *
 * The component is admin-only (lives in `/components/admin/`); the client
 * wizard never receives provenance props so markers can't leak.
 */

interface SourceDocLite {
  id: string;
  file_name: string;
  mime_type: string | null;
  uploaded_at?: string;
  verification_status?: string;
}

interface Props {
  /** Already filtered to a single profile + field, but may include
   * superseded rows (used for the "previous value" tooltip on overrides). */
  extractions: FieldExtraction[];
  /** Source docs available for this profile, used to resolve doc metadata
   * for the inline preview. Indexed by `documents.id`. */
  sourceDocs: SourceDocLite[];
  /** Human-readable field label, e.g. "Passport number". Surfaces in the
   * preview-dialog banner. */
  fieldLabel: string;
  /** Defensive guard: admin context only. Defaults to `true` because
   * the component lives in `/components/admin/` and the only intended
   * call site is the admin services detail page. If the client ever
   * imports it, the call site can pass `adminContext={false}` (or
   * simply omit the marker). */
  adminContext?: boolean;
}

function pickLatest(rows: FieldExtraction[]): FieldExtraction | null {
  if (rows.length === 0) return null;
  // Prefer the row that's still current; otherwise the most recent.
  const current = rows.filter((r) => r.superseded_at === null);
  const pool = current.length > 0 ? current : rows;
  return pool.reduce((latest, r) =>
    new Date(r.extracted_at) > new Date(latest.extracted_at) ? r : latest
  );
}

function pickPriorOverridden(rows: FieldExtraction[], latest: FieldExtraction): FieldExtraction | null {
  // For admin_override tooltips: show the most-recent superseded row whose
  // value differs from the override.
  const candidates = rows
    .filter((r) => r.id !== latest.id && r.extracted_value !== latest.extracted_value)
    .sort((a, b) => new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime());
  return candidates[0] ?? null;
}

export function FieldProvenanceMarker({
  extractions,
  sourceDocs,
  fieldLabel,
  adminContext = true,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const latest = useMemo(() => pickLatest(extractions), [extractions]);
  const sourceDoc = useMemo(() => {
    if (!latest?.source_document_id) return null;
    return sourceDocs.find((d) => d.id === latest.source_document_id) ?? null;
  }, [latest, sourceDocs]);

  // B-070 Batch 4 — admin-only feature: skip rendering when not in admin context.
  if (!adminContext) return null;
  if (!latest) return null;
  if (latest.source === "manual") return null;

  const isOverride = latest.source === "admin_override";
  const Icon = isOverride ? PencilLine : Sparkles;

  // Tooltip text
  let tooltipText: string;
  if (isOverride) {
    const prior = pickPriorOverridden(extractions, latest);
    tooltipText = prior?.extracted_value
      ? `Admin override (was: ${prior.extracted_value})`
      : "Admin override";
  } else {
    tooltipText = sourceDoc
      ? `Auto-filled from ${sourceDoc.file_name}`
      : "Auto-filled by AI";
  }

  const canPreview = !!sourceDoc;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (canPreview) setPreviewOpen(true);
                }}
                disabled={!canPreview}
                aria-label={tooltipText}
                className={`inline-flex items-center justify-center h-4 w-4 rounded shrink-0 align-middle ${
                  isOverride ? "text-amber-600" : "text-blue-500"
                } ${canPreview ? "hover:bg-gray-100 cursor-pointer" : "cursor-default opacity-60"}`}
              >
                <Icon className="h-3 w-3" strokeWidth={2.25} />
              </button>
            }
          />
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {canPreview && sourceDoc && (
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
