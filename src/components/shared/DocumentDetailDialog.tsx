"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { X, Download, CheckCircle, XCircle, AlertTriangle, ChevronDown, RefreshCw, Upload, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DocumentUpdateRequestDialog } from "@/components/admin/DocumentUpdateRequestDialog";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";
import { compressIfImage } from "@/lib/imageCompression";
import type { DocumentUpdateRequest } from "@/app/(admin)/admin/services/[id]/page";
import type { VerificationResult } from "@/types";

export interface DocumentDetailDoc {
  id: string;
  file_name: string;
  mime_type?: string | null;
  uploaded_at: string;
  document_type_id?: string | null;
  verification_status?: string | null;
  verification_result?: Record<string, unknown> | null;
  admin_status?: string | null;
  admin_status_note?: string | null;
  admin_status_at?: string | null;
  document_types?: { name: string; category?: string } | null;
  client_profiles?: { full_name: string | null } | null;
}

interface Recipient {
  id: string;
  name: string;
  email: string | null;
  label: string;
}

interface Props {
  doc: DocumentDetailDoc;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Admin only: recipients for request update */
  recipients?: Recipient[];
  /** Admin only: existing update requests for this doc */
  updateRequests?: DocumentUpdateRequest[];
  serviceId?: string;
  onStatusChange?: (docId: string, status: string, note?: string) => void;
  onRequestSent?: (req: DocumentUpdateRequest) => void;
  /** If provided, shows "Replace Document" upload */
  onDocumentReplaced?: (newDoc: Partial<DocumentDetailDoc>) => void;
}

function formatDate(str: string | null | undefined): string {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function DocumentDetailDialog({
  doc,
  isAdmin,
  open,
  onOpenChange,
  recipients = [],
  updateRequests = [],
  serviceId,
  onStatusChange,
  onRequestSent,
  onDocumentReplaced,
}: Props) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [adminStatus, setAdminStatus] = useState(doc.admin_status);
  const [adminStatusNote, setAdminStatusNote] = useState(doc.admin_status_note);
  const [adminStatusAt, setAdminStatusAt] = useState(doc.admin_status_at);
  const [adminSaving, setAdminSaving] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const [extractedOpen, setExtractedOpen] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);

  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [aiStatus, setAiStatus] = useState<string | null>(doc.verification_status ?? null);
  const [aiVerResult, setAiVerResult] = useState<Record<string, unknown> | null>(doc.verification_result ?? null);
  const [rerunning, setRerunning] = useState(false);

  // Sync AI status when doc prop changes
  useEffect(() => {
    setAiStatus(doc.verification_status ?? null);
    setAiVerResult(doc.verification_result ?? null);
  }, [doc.verification_status, doc.verification_result]);

  // Fetch signed URL when dialog opens
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

  // Sync admin status when doc prop changes
  useEffect(() => {
    setAdminStatus(doc.admin_status);
    setAdminStatusNote(doc.admin_status_note);
    setAdminStatusAt(doc.admin_status_at);
  }, [doc.admin_status, doc.admin_status_note, doc.admin_status_at]);

  const verResult = (aiVerResult ?? doc.verification_result) as VerificationResult | null;
  const flags = verResult?.flags ?? [];
  const ruleResults = verResult?.rule_results ?? [];
  const extractedFields = verResult?.extracted_fields ?? {};
  const confidence = verResult?.confidence_score;
  const passedRules = ruleResults.filter((r) => r.passed).length;
  const typeName = doc.document_types?.name ?? doc.file_name;
  // Fall back to filename extension when mime_type is null on older uploads.
  function inferMimeFromName(name: string | null | undefined): string {
    if (!name) return "";
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["jpg","jpeg"].includes(ext)) return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "gif") return "image/gif";
    if (ext === "tiff" || ext === "tif") return "image/tiff";
    if (ext === "pdf") return "application/pdf";
    return "";
  }
  const mimeType = doc.mime_type ?? inferMimeFromName(doc.file_name);
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  async function handleApprove() {
    setAdminSaving(true);
    try {
      const res = await fetch(`/api/admin/documents/library/${doc.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) throw new Error("Failed");
      setAdminStatus("approved");
      const now = new Date().toISOString();
      setAdminStatusAt(now);
      onStatusChange?.(doc.id, "approved");
      toast.success("Document approved", { position: "top-right" });
    } catch {
      toast.error("Failed to approve");
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectNote.trim()) return;
    setAdminSaving(true);
    try {
      const res = await fetch(`/api/admin/documents/library/${doc.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", note: rejectNote.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setAdminStatus("rejected");
      setAdminStatusNote(rejectNote.trim());
      const now = new Date().toISOString();
      setAdminStatusAt(now);
      setShowRejectForm(false);
      setRejectNote("");
      onStatusChange?.(doc.id, "rejected", rejectNote.trim());
      toast.success("Document rejected", { position: "top-right" });
    } catch {
      toast.error("Failed to reject");
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleRerunAi() {
    setRerunning(true);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}/rerun-ai`, { method: "POST" });
      const data = (await res.json()) as {
        document?: {
          verification_status?: string;
          verification_result?: Record<string, unknown> | null;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Re-run failed");
      if (data.document) {
        setAiStatus(data.document.verification_status ?? null);
        setAiVerResult(data.document.verification_result ?? null);
      }
      toast.success("AI verification re-ran", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRerunning(false);
    }
  }

  async function handleReplace(file: File) {
    if (!serviceId || !doc.document_type_id) return;
    setReplacing(true);

    // B-037 — compress images client-side before hitting Vercel.
    let uploadFile = file;
    if (file.type.startsWith("image/") && file.size > 500 * 1024) {
      const optimisingToast = toast.loading("Optimising image…", { position: "top-right" });
      try {
        uploadFile = await compressIfImage(file);
      } finally {
        toast.dismiss(optimisingToast);
      }
    }

    // Vercel serverless request body limit is 4.5 MB on Hobby.
    // Catch this client-side so the user sees a clear message instead of HTML 413.
    const VERCEL_LIMIT = 4.5 * 1024 * 1024;
    if (uploadFile.size > VERCEL_LIMIT) {
      toast.error(`File is too large (${(uploadFile.size / 1024 / 1024).toFixed(1)} MB). Please upload a file under 4.5 MB.`);
      setReplacing(false);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("documentTypeId", doc.document_type_id);
      const res = await fetch(`/api/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      // Read as text first so a non-JSON body (e.g. a 413 HTML page) doesn't throw.
      const raw = await res.text();
      let data: { document?: Partial<DocumentDetailDoc>; error?: string } = {};
      try { data = raw ? JSON.parse(raw) as typeof data : {}; } catch { /* non-JSON response */ }
      if (!res.ok) {
        if (res.status === 413) throw new Error("File is too large. Please upload under 4.5 MB.");
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      toast.success("Document replaced", { position: "top-right" });
      if (data.document) onDocumentReplaced?.(data.document);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setReplacing(false);
    }
  }

  const latestRequest = updateRequests[0] ?? null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
        <DialogContent className="max-w-2xl w-full p-0 flex flex-col overflow-hidden max-h-[90vh]">
          {/* Header */}
          <DialogHeader className="px-5 py-3 border-b flex-shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-base text-brand-navy">{typeName}</DialogTitle>
                <p className="text-xs text-gray-400 mt-0.5">
                  Uploaded {formatDate(doc.uploaded_at)}
                  {doc.client_profiles?.full_name ? ` · by ${doc.client_profiles.full_name}` : ""}
                </p>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">
            {/* Preview */}
            <div className="border-b bg-gray-50" style={{ height: 260 }}>
              {previewLoading && (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading preview…
                </div>
              )}
              {previewError && (
                <div className="flex items-center justify-center h-full text-sm text-red-500">
                  {previewError}
                </div>
              )}
              {signedUrl && isImage && (
                <div className="flex items-center justify-center h-full p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={signedUrl} alt={doc.file_name} className="max-h-full max-w-full object-contain rounded shadow" />
                </div>
              )}
              {signedUrl && isPdf && (
                <iframe src={signedUrl} className="w-full h-full border-0" title={doc.file_name} />
              )}
              {signedUrl && !isImage && !isPdf && (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-gray-500">
                  <p>Preview not available for this file type.</p>
                  <a href={signedUrl} target="_blank" rel="noopener noreferrer" download={doc.file_name}>
                    <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1.5" />Download to view</Button>
                  </a>
                </div>
              )}
              {!previewLoading && !previewError && !signedUrl && (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  No preview available
                </div>
              )}
            </div>

            <div className="p-5 space-y-5">
              {/* Two-track status */}
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Status</p>
                <DocumentStatusBadge aiStatus={aiStatus} adminStatus={adminStatus} />
              </section>

              {/* AI Verification */}
              {verResult && (
                <section>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">AI Verification</p>
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    {confidence !== undefined && (
                      <span className="text-sm font-medium text-gray-700">
                        Confidence: {Math.round(confidence * 100)}%
                      </span>
                    )}
                    {ruleResults.length > 0 && (
                      <span className={`text-sm font-medium ${passedRules === ruleResults.length ? "text-green-600" : "text-amber-600"}`}>
                        Rules: {passedRules}/{ruleResults.length} passed
                      </span>
                    )}
                  </div>
                  {flags.length > 0 && (
                    <div className="space-y-1">
                      {flags.map((flag, i) => (
                        <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5 flex items-start gap-1.5">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          {flag}
                        </p>
                      ))}
                    </div>
                  )}
                  {ruleResults.filter((r) => !r.passed).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {ruleResults.filter((r) => !r.passed).map((rr) => (
                        <div key={rr.rule_number} className="rounded bg-red-50 border border-red-100 px-2.5 py-1.5 text-xs">
                          <p className="font-medium text-red-700">{rr.rule_number}. {rr.rule_text}</p>
                          {rr.explanation && <p className="text-gray-600 mt-0.5">{rr.explanation}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Extracted Fields */}
              {Object.keys(extractedFields).length > 0 && (
                <section>
                  <button
                    onClick={() => setExtractedOpen(!extractedOpen)}
                    className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1 hover:text-gray-600"
                  >
                    Extracted Fields
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${extractedOpen ? "rotate-180" : ""}`} />
                  </button>
                  {extractedOpen && (
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {Object.entries(extractedFields).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-gray-400 capitalize">{k.replace(/_/g, " ")}:</span>{" "}
                          <span className="text-gray-800 font-medium">{String(v ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Admin Review (admin only) */}
              {isAdmin && (
                <section className="border rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Admin Review</p>

                  {adminStatus === "approved" && (
                    <p className="text-sm text-green-700 flex items-center gap-1.5">
                      <CheckCircle className="h-4 w-4" />
                      Approved {formatDate(adminStatusAt)}
                    </p>
                  )}
                  {adminStatus === "rejected" && (
                    <div className="text-sm text-red-700 space-y-1">
                      <p className="flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" />
                        Rejected {formatDate(adminStatusAt)}
                      </p>
                      {adminStatusNote && (
                        <p className="text-xs text-gray-500 ml-6">Reason: {adminStatusNote}</p>
                      )}
                    </div>
                  )}

                  {adminStatus !== "approved" && adminStatus !== "rejected" && !showRejectForm && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline" size="sm"
                        className="h-8 px-3 text-xs text-green-700 border-green-300 hover:bg-green-50 gap-1"
                        disabled={adminSaving}
                        onClick={() => void handleApprove()}
                      >
                        {adminSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                        Approve
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-8 px-3 text-xs text-red-700 border-red-300 hover:bg-red-50 gap-1"
                        disabled={adminSaving}
                        onClick={() => setShowRejectForm(true)}
                      >
                        <XCircle className="h-3 w-3" />
                        Reject
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        className="h-8 px-3 text-xs gap-1"
                        disabled={rerunning}
                        onClick={() => void handleRerunAi()}
                        title="Re-run AI verification on this document"
                      >
                        {rerunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Re-run AI
                      </Button>
                    </div>
                  )}

                  {(adminStatus === "approved" || adminStatus === "rejected") && (
                    <div className="pt-1">
                      <Button
                        variant="outline" size="sm"
                        className="h-7 px-2.5 text-xs gap-1"
                        disabled={rerunning}
                        onClick={() => void handleRerunAi()}
                        title="Re-run AI verification on this document"
                      >
                        {rerunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Re-run AI
                      </Button>
                    </div>
                  )}

                  {showRejectForm && (
                    <div className="space-y-2">
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Rejection reason (required)"
                        rows={2}
                        autoFocus
                        className="w-full text-xs border rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-brand-blue"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline" size="sm"
                          className="h-7 px-2.5 text-xs text-red-700 border-red-300 hover:bg-red-50"
                          disabled={adminSaving || !rejectNote.trim()}
                          onClick={() => void handleReject()}
                        >
                          {adminSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                          Confirm Reject
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => { setShowRejectForm(false); setRejectNote(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Request Update (admin only) */}
              {isAdmin && recipients.length > 0 && (
                <section className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Request Update</p>
                  <Button
                    variant="outline" size="sm"
                    className="h-8 px-3 text-xs gap-1.5"
                    onClick={() => setRequestDialogOpen(true)}
                  >
                    Send Update Request
                  </Button>
                  {latestRequest && (
                    <p className="text-xs text-gray-500 border-t pt-2 mt-1">
                      <span className="font-medium">Last request:</span>{" "}
                      &ldquo;{latestRequest.note.slice(0, 80)}{latestRequest.note.length > 80 ? "…" : ""}&rdquo;
                      {" — "}{formatDate(latestRequest.sent_at)}
                      {latestRequest.requested_by_name ? ` by ${latestRequest.requested_by_name}` : ""}
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t flex-shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(onDocumentReplaced && serviceId && doc.document_type_id) && (
                <>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleReplace(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline" size="sm"
                    className="text-xs gap-1.5"
                    disabled={replacing}
                    onClick={() => replaceInputRef.current?.click()}
                  >
                    {replacing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Replace Document
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {signedUrl && (
                <a href={signedUrl} target="_blank" rel="noopener noreferrer" download={doc.file_name}>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                </a>
              )}
              <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Request Update sub-dialog (admin only) */}
      {isAdmin && serviceId && (
        <DocumentUpdateRequestDialog
          documentId={doc.id}
          documentTypeName={typeName}
          serviceId={serviceId}
          recipients={recipients}
          verificationFlags={flags}
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
          onSent={(req) => {
            onRequestSent?.(req);
            setRequestDialogOpen(false);
          }}
        />
      )}
    </>
  );
}
