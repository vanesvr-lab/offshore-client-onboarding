"use client";

// B-076 — single per-doc row used in both the client wizard's grouped
// doc lists and the admin's per-profile expanded view. Same visual
// (file icon + name + status badge + Upload/View) on both sides; the
// only differences are admin's View click opens `DocumentDetailDialog`
// (wired by the caller via `onViewClick`) and admin's row exposes a
// status pill regardless of "Uploaded" copy.

import { CheckCircle2, FileText, Loader2, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";

export interface KycDocRowData {
  /** Document upload id; null when nothing uploaded yet. */
  id: string | null;
  document_type_id: string;
  document_name: string;
  is_uploaded: boolean;
  /** Populated when uploaded. */
  verification_status?: string | null;
  admin_status?: string | null;
  /** Mime + uploaded_at + verification_result are needed by the admin dialog. */
  file_name?: string | null;
  mime_type?: string | null;
  uploaded_at?: string | null;
  verification_result?: Record<string, unknown> | null;
  admin_status_note?: string | null;
  admin_status_at?: string | null;
}

export interface KycDocRowProps {
  doc: KycDocRowData;
  /** When true, the View button is the compact eye-only style and the row
   *  hides the "Uploaded" word — admin uses this for a denser scan view. */
  showAdminControls?: boolean;
  /** Click View on an uploaded row. */
  onViewClick?: (docId: string) => void;
  /** Click Upload on an empty row. */
  onUploadClick?: (docTypeId: string) => void;
  /** External "this row is uploading right now" flag. */
  isUploading?: boolean;
}

export function KycDocRow({
  doc,
  showAdminControls = false,
  onViewClick,
  onUploadClick,
  isUploading,
}: KycDocRowProps) {
  const uploaded = doc.is_uploaded;
  const isApproved = uploaded && doc.admin_status === "approved";

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {!uploaded && <FileText className="h-4 w-4 text-amber-500 shrink-0" />}
        {uploaded && !isApproved && <FileText className="h-4 w-4 text-gray-500 shrink-0" />}
        {isApproved && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
        <span
          className={`text-sm truncate ${
            !uploaded
              ? "text-amber-700"
              : isApproved
                ? "text-green-700 font-medium"
                : "text-gray-700"
          }`}
        >
          {doc.document_name}
        </span>
        {uploaded && (
          <DocumentStatusBadge
            aiStatus={doc.verification_status}
            adminStatus={doc.admin_status}
            compact
            className="shrink-0"
          />
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3">
        {uploaded && doc.id ? (
          <>
            {!showAdminControls && (
              <span className="text-sm text-green-700 font-medium hidden sm:inline">
                Uploaded
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-3 text-sm gap-1.5 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
              onClick={() => doc.id && onViewClick?.(doc.id)}
              title="View document"
              aria-label="View document"
            >
              <Eye className="h-4 w-4 text-gray-600" />
              View
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="h-10 px-4 py-2 text-sm font-medium gap-2 rounded-md bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 shadow-none"
            disabled={isUploading}
            onClick={() => onUploadClick?.(doc.document_type_id)}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
