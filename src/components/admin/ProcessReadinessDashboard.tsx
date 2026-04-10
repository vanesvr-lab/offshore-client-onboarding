"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Eye, Upload, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import type { DocumentType } from "@/types";

interface ProcessDoc {
  id: string;
  requirement_id: string;
  document_id: string | null;
  status: "available" | "missing" | "requested" | "received";
  source: string | null;
  requested_at: string | null;
  received_at: string | null;
  document_types?: { id: string; name: string; category: string } | null;
  documents?: {
    id: string;
    file_name: string;
    uploaded_at: string;
    expiry_date: string | null;
  } | null;
}

interface ProcessReadinessDashboardProps {
  processId: string;
  processName: string;
  clientId: string;
  clientName: string;
  processDocs: ProcessDoc[];
  allDocumentTypes: DocumentType[];
}

function StatusIcon({ status }: { status: ProcessDoc["status"] }) {
  if (status === "available" || status === "received")
    return <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />;
  if (status === "requested")
    return <Clock className="h-4 w-4 text-amber-400 shrink-0" />;
  return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
}

function isExpiringSoon(d: string | null): boolean {
  if (!d) return false;
  return (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 30;
}

function fmt(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ProcessReadinessDashboard({
  processId,
  processName,
  clientId,
  clientName,
  processDocs: initialDocs,
  allDocumentTypes,
}: ProcessReadinessDashboardProps) {
  const router = useRouter();
  const [docs, setDocs] = useState<ProcessDoc[]>(initialDocs);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [uploadDialogDoc, setUploadDialogDoc] = useState<ProcessDoc | null>(null);
  const [requesting, setRequesting] = useState(false);

  const available = docs.filter((d) => d.status === "available" || d.status === "received").length;
  const pct = docs.length > 0 ? Math.round((available / docs.length) * 100) : 0;

  const missingIds = docs.filter((d) => d.status === "missing").map((d) => d.id);
  const requestedIds = docs.filter((d) => d.status === "requested").map((d) => d.id);

  async function requestDocuments(ids: string[]) {
    setRequesting(true);
    try {
      const res = await fetch(`/api/admin/processes/${processId}/request-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processDocumentIds: ids, message: requestMessage }),
      });
      const data = await res.json() as { error?: string; emailSent?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setDocs((prev) =>
        prev.map((d) => ids.includes(d.id) ? { ...d, status: "requested", requested_at: new Date().toISOString() } : d)
      );
      toast.success(data.emailSent ? "Request sent to client" : "Documents marked as requested (no client email found)");
      setRequestDialogOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRequesting(false);
    }
  }

  // Group by category
  const categories: Record<string, ProcessDoc[]> = {};
  for (const doc of docs) {
    const cat = doc.document_types?.category ?? "additional";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(doc);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border bg-white px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-brand-navy">{processName}</h2>
            <p className="text-sm text-gray-500">{clientName}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-brand-navy">{available}/{docs.length}</p>
            <p className="text-xs text-gray-400">documents available ({pct}%)</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Grouped document rows */}
      {Object.entries(categories).map(([cat, catDocs]) => (
        <div key={cat}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 capitalize">{cat}</h3>
          <div className="rounded-lg border bg-white overflow-hidden">
            {catDocs.map((doc, i) => {
              const name = doc.document_types?.name ?? "Unknown document";
              const isLast = i === catDocs.length - 1;
              return (
                <div key={doc.id} className={`flex items-center justify-between px-4 py-3 ${!isLast ? "border-b" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon status={doc.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-navy truncate">{name}</p>
                      {doc.status === "available" || doc.status === "received" ? (
                        <p className="text-xs text-gray-400">
                          {doc.source === "kyc_reused" ? "Already uploaded — from document library" : "Uploaded manually"}
                          {doc.documents?.uploaded_at && ` · ${fmt(doc.documents.uploaded_at)}`}
                          {doc.documents?.expiry_date && isExpiringSoon(doc.documents.expiry_date) && (
                            <span className="text-amber-600 ml-1">· expires {fmt(doc.documents.expiry_date)}</span>
                          )}
                        </p>
                      ) : doc.status === "requested" ? (
                        <p className="text-xs text-amber-600">Requested on {fmt(doc.requested_at)}</p>
                      ) : (
                        <p className="text-xs text-red-500">Not uploaded — needs to be collected</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    {(doc.status === "available" || doc.status === "received") && doc.documents?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-brand-blue"
                        onClick={() => window.open(`/api/documents/${doc.documents!.id}/download`, "_blank")}
                      >
                        <Eye className="h-3 w-3 mr-1" /> Preview
                      </Button>
                    )}
                    {doc.status === "missing" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => requestDocuments([doc.id])}
                        >
                          <Send className="h-3 w-3 mr-1" /> Request
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setUploadDialogDoc(doc)}
                        >
                          <Upload className="h-3 w-3 mr-1" /> Upload
                        </Button>
                      </>
                    )}
                    {doc.status === "requested" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setUploadDialogDoc(doc)}
                        >
                          <Upload className="h-3 w-3 mr-1" /> Upload
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-amber-600"
                          onClick={() => requestDocuments([doc.id])}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Resend
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bottom actions */}
      <div className="flex gap-3">
        {missingIds.length > 0 && (
          <Button
            variant="outline"
            onClick={() => setRequestDialogOpen(true)}
          >
            <Send className="h-4 w-4 mr-2" />
            Request all {missingIds.length + requestedIds.length} missing documents
          </Button>
        )}
        <Button variant="outline" disabled>
          Generate document package (coming soon)
        </Button>
      </div>

      {/* Request all dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={(o) => setRequestDialogOpen(o)} disablePointerDismissal>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request missing documents from client</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will send an email to the client listing {missingIds.length} missing document{missingIds.length !== 1 ? "s" : ""}.
          </p>
          <Textarea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            rows={3}
            placeholder="Optional additional message to the client…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => requestDocuments(missingIds)}
              disabled={requesting}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {requesting ? "Sending…" : "Send request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload dialog */}
      {uploadDialogDoc && (
        <Dialog open onOpenChange={(o) => { if (!o) setUploadDialogDoc(null); }} disablePointerDismissal>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload {uploadDialogDoc.document_types?.name ?? "document"}</DialogTitle>
            </DialogHeader>
            <DocumentUploadWidget
              clientId={clientId}
              documentTypeId={uploadDialogDoc.document_types?.id}
              documentTypeName={uploadDialogDoc.document_types?.name}
              documentTypes={allDocumentTypes}
              onUploadComplete={async (doc) => {
                // Update local state — server-side linking handled by DocumentUploadWidget via library API

                setDocs((prev) =>
                  prev.map((d) =>
                    d.id === uploadDialogDoc.id
                      ? { ...d, status: "received", document_id: doc.id, documents: { id: doc.id, file_name: doc.file_name, uploaded_at: doc.uploaded_at, expiry_date: doc.expiry_date } }
                      : d
                  )
                );
                setUploadDialogDoc(null);
                toast.success("Document uploaded and linked to process");
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
