"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, FileText, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { ExtractedFieldsPanel } from "@/components/admin/ExtractedFieldsPanel";
import { DocumentPreviewDialog } from "@/components/admin/DocumentPreviewDialog";
import { normalizeConfidence } from "@/lib/ai/confidence";
import type { DocumentRecord, DocumentType, VerificationResult } from "@/types";

type DocumentWithType = DocumentRecord & {
  document_types?: DocumentType | null;
};

interface DocumentStatusRowProps {
  document: DocumentWithType;
  applicationId?: string;
  onStatusChange?: () => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function AdminStatusLine({
  document,
  onStatusChange,
}: {
  document: DocumentWithType;
  onStatusChange?: () => void;
}) {
  const router = useRouter();
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminStatus = (document as DocumentRecord & { admin_status?: string | null }).admin_status;
  const adminStatusNote = (document as DocumentRecord & { admin_status_note?: string | null }).admin_status_note;
  const adminStatusAt = (document as DocumentRecord & { admin_status_at?: string | null }).admin_status_at;

  async function handleApprove() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/library/${document.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed");
      }
      router.refresh();
      onStatusChange?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectNote.trim()) {
      setError("Rejection reason is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/library/${document.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", note: rejectNote.trim() }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Failed");
      }
      router.refresh();
      onStatusChange?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
      setShowRejectForm(false);
    }
  }

  if (adminStatus === "approved") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Approved {adminStatusAt ? formatDate(adminStatusAt) : ""}</span>
      </div>
    );
  }

  if (adminStatus === "rejected") {
    return (
      <div className="text-xs text-red-700 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5" />
          <span>Rejected {adminStatusAt ? formatDate(adminStatusAt) : ""}</span>
        </div>
        {adminStatusNote && (
          <p className="text-gray-500 ml-5">Reason: {adminStatusNote}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400 font-medium">Admin:</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Pending review</span>
        {!showRejectForm && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50"
              disabled={saving}
              onClick={handleApprove}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50"
              disabled={saving}
              onClick={() => setShowRejectForm(true)}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Reject
            </Button>
          </>
        )}
      </div>
      {showRejectForm && (
        <div className="ml-16 space-y-1">
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Rejection reason (required)"
            className="w-full text-xs border rounded px-2 py-1.5 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-brand-blue"
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50"
              disabled={saving}
              onClick={handleReject}
            >
              Confirm Reject
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => { setShowRejectForm(false); setRejectNote(""); setError(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-500 ml-16">{error}</p>}
    </div>
  );
}

export function DocumentStatusRow({
  document,
  applicationId,
  onStatusChange,
}: DocumentStatusRowProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  const verificationResult = document.verification_result as VerificationResult | null;
  const confidence = verificationResult?.confidence_score;
  const flags = verificationResult?.flags ?? [];
  const typeName = document.document_types?.name ?? "Document";

  const fullReviewHref = applicationId
    ? `/admin/applications/${applicationId}/documents/${document.id}`
    : null;

  return (
    <div className="py-3 border-b last:border-0 space-y-1.5">
      {/* Line 1: icon + file name + category */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm font-medium text-brand-navy truncate flex-1 min-w-0">
          {typeName}
        </span>
        {document.document_types?.category && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize flex-shrink-0">
            {document.document_types.category}
          </span>
        )}
      </div>

      {/* Line 2: AI status */}
      <div className="flex items-center gap-2 ml-6 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">AI:</span>
        <VerificationBadge status={document.verification_status} />
        {verificationResult?.rule_results && verificationResult.rule_results.length > 0 ? (
          <span className={`text-xs font-medium ${
            verificationResult.rule_results.every((r) => r.passed) ? "text-green-600" : "text-red-600"
          }`}>
            {verificationResult.rule_results.filter((r) => r.passed).length}/{verificationResult.rule_results.length} rules passed
          </span>
        ) : (
          <>
            {confidence !== undefined && (
              <span className="text-xs text-gray-400">{normalizeConfidence(confidence)}%</span>
            )}
            {flags.length > 0 && (
              <span className="text-xs text-amber-600">{flags.length} flag{flags.length > 1 ? "s" : ""}</span>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </Button>
          {fullReviewHref && (
            <Link href={fullReviewHref}>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-brand-blue">
                <ExternalLink className="h-3 w-3 mr-1" />
                Full Review
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Line 3: Admin status */}
      <div className="ml-6">
        <AdminStatusLine document={document} onStatusChange={onStatusChange} />
      </div>

      {/* Expandable extracted fields */}
      <div className="ml-6">
        <ExtractedFieldsPanel verificationResult={verificationResult} />
      </div>

      {/* Preview dialog */}
      <DocumentPreviewDialog
        documentId={document.id}
        fileName={document.file_name ?? "Document"}
        mimeType={document.mime_type ?? "application/octet-stream"}
        uploadedAt={document.uploaded_at}
        verificationStatus={document.verification_status}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
