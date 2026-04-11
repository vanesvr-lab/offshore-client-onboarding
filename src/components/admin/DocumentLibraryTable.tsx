"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Upload, Eye, Trash2, AlertCircle, AlertTriangle, ScanSearch } from "lucide-react";
import { ExtractedFieldsPanel } from "@/components/admin/ExtractedFieldsPanel";
import { DocumentPreviewDialog } from "@/components/admin/DocumentPreviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import type { DocumentRecord, DocumentType } from "@/types";

type DocumentWithRelations = DocumentRecord & {
  document_types: DocumentType | null;
  document_links: { id: string; linked_to_type: string; linked_to_id: string }[];
};

interface DocumentLibraryTableProps {
  clientId: string;
  documents: DocumentWithRelations[];
  documentTypes: DocumentType[];
}

const CATEGORIES = ["identity", "corporate", "financial", "compliance", "additional"] as const;

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const days = (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days > 0 && days <= 30;
}

function isExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  return new Date(expiryDate).getTime() < Date.now();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function DocumentLibraryTable({
  clientId,
  documents: initialDocs,
  documentTypes,
}: DocumentLibraryTableProps) {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentWithRelations[]>(initialDocs);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentWithRelations | null>(null);

  const filtered = docs.filter((d) => {
    const docTypeName = d.document_types?.name ?? "";
    const matchSearch =
      !search ||
      docTypeName.toLowerCase().includes(search.toLowerCase()) ||
      (d.file_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      filterCategory === "all" || d.document_types?.category === filterCategory;
    const matchStatus =
      filterStatus === "all" || d.verification_status === filterStatus;
    return matchSearch && matchCategory && matchStatus;
  });

  const grouped: Record<string, DocumentWithRelations[]> = {};
  for (const doc of filtered) {
    const cat = doc.document_types?.category ?? "additional";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(doc);
  }

  async function handleDelete(docId: string) {
    setDeleting(docId);
    try {
      const res = await fetch(`/api/documents/library/${docId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Delete failed");
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success("Document removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="pl-8 text-sm"
          />
        </div>

        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v ?? "all")}>
          <SelectTrigger className="w-40 text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? "all")}>
          <SelectTrigger className="w-40 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
            <SelectItem value="manual_review">Manual review</SelectItem>
          </SelectContent>
        </Select>

        <Button
          onClick={() => setUploadOpen(true)}
          className="bg-brand-navy hover:bg-brand-blue ml-auto"
          size="sm"
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload Document
        </Button>
      </div>

      {/* Grouped table */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-white px-6 py-12 text-center text-sm text-gray-400">
          {docs.length === 0 ? "No documents uploaded yet." : "No documents match your filters."}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIES.filter((c) => grouped[c]?.length).map((category) => (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 capitalize">
                {category}
              </h3>
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500">
                      <th className="text-left px-4 py-2 font-medium">Document type</th>
                      <th className="text-left px-4 py-2 font-medium">File</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                      <th className="text-left px-4 py-2 font-medium">Expiry</th>
                      <th className="text-left px-4 py-2 font-medium">Uploaded</th>
                      <th className="text-left px-4 py-2 font-medium">Linked to</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[category].map((doc) => {
                      const expiring = isExpiringSoon(doc.expiry_date);
                      const expired = isExpired(doc.expiry_date);
                      const hasExtracted = doc.verification_result && (
                        Object.keys(doc.verification_result.extracted_fields ?? {}).length > 0 ||
                        (doc.verification_result.flags?.length ?? 0) > 0
                      );
                      return (
                        <>
                          <tr key={doc.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-brand-navy">
                              {doc.document_types?.name ?? "Unknown"}
                            </td>
                            <td className="px-4 py-3 text-gray-600 truncate max-w-[180px]">
                              {doc.file_name ?? "—"}
                            </td>
                            <td className="px-4 py-3">
                              <VerificationBadge status={doc.verification_status} />
                            </td>
                            <td className="px-4 py-3">
                              {doc.expiry_date ? (
                                <span className={expired ? "text-brand-danger" : expiring ? "text-brand-accent" : "text-gray-600"}>
                                  {expired && <AlertCircle className="inline h-3 w-3 mr-0.5" />}
                                  {expiring && !expired && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                                  {formatDate(doc.expiry_date)}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {formatDate(doc.uploaded_at)}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {doc.document_links?.length > 0 ? (
                                <span className="text-xs bg-gray-100 rounded px-1.5 py-0.5">
                                  {doc.document_links.length} link{doc.document_links.length > 1 ? "s" : ""}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-brand-blue"
                                  title="Preview"
                                  onClick={() => setPreviewDoc(doc)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {hasExtracted && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-gray-500"
                                    title="Show AI extracted data"
                                    onClick={() => window.open(`/api/documents/${doc.id}/download`, "_blank")}
                                  >
                                    <ScanSearch className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-brand-danger hover:text-brand-danger"
                                  disabled={deleting === doc.id}
                                  onClick={() => handleDelete(doc.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {hasExtracted && (
                            <tr key={`${doc.id}-extracted`} className="bg-gray-50">
                              <td colSpan={7} className="px-4 pb-2 pt-0">
                                <ExtractedFieldsPanel verificationResult={doc.verification_result} />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      {previewDoc && (
        <DocumentPreviewDialog
          documentId={previewDoc.id}
          fileName={previewDoc.file_name ?? "Document"}
          mimeType={previewDoc.mime_type ?? "application/octet-stream"}
          uploadedAt={previewDoc.uploaded_at}
          verificationStatus={previewDoc.verification_status}
          open={previewDoc !== null}
          onOpenChange={(o) => { if (!o) setPreviewDoc(null); }}
        />
      )}

      {/* Upload dialog */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(o) => { if (!o) setUploadOpen(false); }}
        disablePointerDismissal
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <DocumentUploadWidget
            clientId={clientId}
            showTypeSelector
            documentTypes={documentTypes}
            onUploadComplete={(doc) => {
              setDocs((prev) => [doc as unknown as DocumentWithRelations, ...prev]);
              setUploadOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
