"use client";

// B-075 — right-slide panel that opens from the AI prefill banner's
// `View` button (admin only). Shows the source doc preview, current
// admin/AI status, and Approve / Revoke approval controls.
//
// Companion to `AiPrefillBanner` and the `/api/admin/documents/[id]/admin-status`
// PATCH endpoint.

import { useEffect, useState } from "react";
import { CheckCircle, ChevronDown, Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";
import { normalizeConfidence } from "@/lib/ai/confidence";
import type { VerificationResult } from "@/types";

export interface InlineDocReviewDoc {
  id: string;
  file_name: string;
  mime_type: string | null;
  uploaded_at: string;
  document_type_name?: string | null;
  verification_status: string | null;
  verification_result: VerificationResult | null;
  admin_status: string | null;
  admin_status_note: string | null;
  admin_status_at: string | null;
}

interface Props {
  doc: InlineDocReviewDoc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (next: {
    admin_status: string | null;
    admin_status_note: string | null;
    admin_status_at: string | null;
  }) => void;
}

function formatDate(str: string | null | undefined): string {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function InlineDocReviewPanel({ doc, open, onOpenChange, onStatusChange }: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [adminStatus, setAdminStatus] = useState(doc.admin_status);
  const [adminStatusNote, setAdminStatusNote] = useState(doc.admin_status_note);
  const [adminStatusAt, setAdminStatusAt] = useState(doc.admin_status_at);
  const [pendingNote, setPendingNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiNotesOpen, setAiNotesOpen] = useState(false);

  useEffect(() => {
    setAdminStatus(doc.admin_status);
    setAdminStatusNote(doc.admin_status_note);
    setAdminStatusAt(doc.admin_status_at);
    setPendingNote("");
  }, [doc.id, doc.admin_status, doc.admin_status_note, doc.admin_status_at]);

  useEffect(() => {
    if (!open) return;
    setSignedUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    fetch(`/api/documents/${doc.id}/download`)
      .then((r) => r.json())
      .then((data: { url?: string; error?: string }) => {
        if (data.url) setSignedUrl(data.url);
        else setPreviewError(data.error ?? "Could not load preview");
      })
      .catch(() => setPreviewError("Could not load preview"))
      .finally(() => setPreviewLoading(false));
  }, [open, doc.id]);

  const verResult = doc.verification_result;
  const aiNotes = (verResult as VerificationResult & { notes?: string } | null)?.notes ?? null;
  const flags = verResult?.flags ?? [];
  const confidence = verResult?.confidence_score;
  const ruleResults = verResult?.rule_results ?? [];
  const passedRules = ruleResults.filter((r) => r.passed).length;

  const mime = doc.mime_type ?? "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";

  async function handleApprove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}/admin-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved", note: pendingNote || null }),
      });
      const data = (await res.json()) as {
        admin_status?: string | null;
        admin_status_note?: string | null;
        admin_status_at?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      const next = {
        admin_status: data.admin_status ?? "approved",
        admin_status_note: data.admin_status_note ?? null,
        admin_status_at: data.admin_status_at ?? new Date().toISOString(),
      };
      setAdminStatus(next.admin_status);
      setAdminStatusNote(next.admin_status_note);
      setAdminStatusAt(next.admin_status_at);
      setPendingNote("");
      onStatusChange(next);
      toast.success("Document approved", { position: "top-right" });
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Approve failed", {
        position: "top-right",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}/admin-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Revoke failed");
      const next = {
        admin_status: null,
        admin_status_note: null,
        admin_status_at: null,
      };
      setAdminStatus(next.admin_status);
      setAdminStatusNote(next.admin_status_note);
      setAdminStatusAt(next.admin_status_at);
      onStatusChange(next);
      toast.success("Approval revoked", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Revoke failed", {
        position: "top-right",
      });
    } finally {
      setSaving(false);
    }
  }

  const isApproved = adminStatus === "approved";
  const docTitle = doc.document_type_name || doc.file_name;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{docTitle}</SheetTitle>
          <SheetDescription>
            Uploaded {formatDate(doc.uploaded_at)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Preview */}
          <div className="border-b bg-gray-50" style={{ height: 280 }}>
            {previewLoading && (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading preview…
              </div>
            )}
            {previewError && (
              <div className="flex items-center justify-center h-full text-sm text-red-500 px-3 text-center">
                {previewError}
              </div>
            )}
            {signedUrl && isImage && (
              <div className="flex items-center justify-center h-full p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signedUrl}
                  alt={doc.file_name}
                  className="max-h-full max-w-full object-contain rounded shadow"
                />
              </div>
            )}
            {signedUrl && isPdf && (
              <iframe
                src={signedUrl}
                className="w-full h-full border-0"
                title={doc.file_name}
              />
            )}
            {signedUrl && !isImage && !isPdf && (
              <div className="flex items-center justify-center h-full text-sm text-gray-500 px-3 text-center">
                Preview not available for this file type. Open the deep document
                review page to download.
              </div>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Status pill */}
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Status
              </p>
              <DocumentStatusBadge
                aiStatus={doc.verification_status}
                adminStatus={adminStatus}
              />
              {isApproved && adminStatusAt && (
                <p className="mt-2 text-xs text-green-700 flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Approved {formatDate(adminStatusAt)}
                </p>
              )}
              {isApproved && adminStatusNote && (
                <p className="mt-1 text-xs text-gray-500">
                  Note: {adminStatusNote}
                </p>
              )}
            </section>

            {/* AI Verification summary */}
            {verResult && (
              <section>
                <button
                  type="button"
                  onClick={() => setAiNotesOpen((v) => !v)}
                  className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 hover:text-gray-600"
                >
                  AI Verification
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${aiNotesOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {aiNotesOpen && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-3 flex-wrap text-xs">
                      {confidence !== undefined && (
                        <span className="font-medium text-gray-700">
                          Confidence: {normalizeConfidence(confidence)}%
                        </span>
                      )}
                      {ruleResults.length > 0 && (
                        <span
                          className={`font-medium ${passedRules === ruleResults.length ? "text-green-600" : "text-amber-600"}`}
                        >
                          Rules: {passedRules}/{ruleResults.length} passed
                        </span>
                      )}
                    </div>
                    {flags.length > 0 && (
                      <div className="space-y-1">
                        {flags.map((flag, i) => (
                          <p
                            key={i}
                            className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5 flex items-start gap-1.5"
                          >
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            {flag}
                          </p>
                        ))}
                      </div>
                    )}
                    {aiNotes && (
                      <p className="text-xs text-gray-700 bg-gray-50 rounded px-2.5 py-1.5">
                        {aiNotes}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Approve form (only when not yet approved) */}
            {!isApproved && (
              <section className="space-y-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Note (optional)
                </label>
                <Textarea
                  rows={2}
                  value={pendingNote}
                  onChange={(e) => setPendingNote(e.target.value)}
                  placeholder="Optional context to record with this approval…"
                  className="text-sm resize-none"
                />
              </section>
            )}
          </div>
        </div>

        <SheetFooter className="border-t flex-row justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Close
          </Button>
          {isApproved ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRevoke()}
              disabled={saving}
              className="gap-1"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Revoke approval
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => void handleApprove()}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white gap-1"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              Approve
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
