"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, CheckCircle, AlertCircle, Clock, X, Eye, RefreshCw, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DocumentRecord, DocumentType } from "@/types";

interface PersonOption {
  id: string;
  name: string;
  role: string;
}

interface DocumentUploadWidgetProps {
  clientId: string;
  kycRecordId?: string;
  documentTypeId?: string;
  documentTypeName?: string;
  showTypeSelector?: boolean;
  showPersonSelector?: boolean;
  persons?: PersonOption[];
  existingDocument?: DocumentRecord | null;
  onUploadComplete?: (doc: DocumentRecord) => void;
  compact?: boolean;
  documentTypes?: DocumentType[];
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VerificationIcon({ status }: { status: string }) {
  if (status === "verified") return <CheckCircle className="h-3.5 w-3.5 text-brand-success" />;
  if (status === "flagged") return <AlertCircle className="h-3.5 w-3.5 text-brand-danger" />;
  return <Clock className="h-3.5 w-3.5 text-gray-400" />;
}

export function DocumentUploadWidget({
  clientId,
  kycRecordId,
  documentTypeId: initialTypeId,
  documentTypeName,
  showTypeSelector = false,
  showPersonSelector = false,
  persons = [],
  existingDocument,
  onUploadComplete,
  compact = false,
  documentTypes = [],
}: DocumentUploadWidgetProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [current, setCurrent] = useState<DocumentRecord | null>(existingDocument ?? null);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(initialTypeId ?? "");
  const [selectedPersonId, setSelectedPersonId] = useState<string>(kycRecordId ?? "");
  const [replacing, setReplacing] = useState(false);

  async function upload(file: File) {
    const typeId = selectedTypeId || initialTypeId;
    if (!typeId) {
      toast.error("Please select a document type first");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("clientId", clientId);
      fd.append("documentTypeId", typeId);
      if (selectedPersonId) fd.append("kycRecordId", selectedPersonId);

      const res = await fetch("/api/documents/library", { method: "POST", body: fd });
      const data = await res.json() as { document?: DocumentRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      const doc = data.document!;
      setCurrent(doc);
      setReplacing(false);
      toast.success("Document uploaded — AI verification running");
      onUploadComplete?.(doc);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) upload(acceptedFiles[0]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTypeId, selectedPersonId]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "application/pdf": [], "image/jpeg": [], "image/png": [], "image/webp": [], "image/tiff": [] },
    maxSize: 10 * 1024 * 1024,
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
  });

  // ── Compact (inline) mode ─────────────────────────────────────────────────
  if (compact) {
    if (current && !replacing) {
      return (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <VerificationIcon status={current.verification_status} />
          <Paperclip className="h-3 w-3 text-gray-400" />
          <span className="truncate max-w-[140px]">{current.file_name}</span>
          <span className="text-gray-400">{formatBytes(current.file_size)}</span>
          <button
            onClick={() => setReplacing(true)}
            className="text-brand-blue hover:underline"
            title="Replace"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={open}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-brand-blue hover:underline disabled:opacity-50"
        >
          <Upload className="h-3 w-3" />
          {uploading ? "Uploading…" : current ? "Replace" : `Upload ${documentTypeName ?? "document"}`}
        </button>
        <input {...getInputProps()} />
      </div>
    );
  }

  // ── Standalone (full) mode ────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {showTypeSelector && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-600">Document type</Label>
          <Select value={selectedTypeId} onValueChange={(v) => setSelectedTypeId(v ?? "")}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select document type…" />
            </SelectTrigger>
            <SelectContent>
              {["identity", "corporate", "financial", "compliance", "additional"].map((cat) => {
                const items = documentTypes.filter((d) => d.category === cat);
                if (!items.length) return null;
                return (
                  <div key={cat}>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                      {cat}
                    </div>
                    {items.map((dt) => (
                      <SelectItem key={dt.id} value={dt.id}>
                        {dt.name}
                      </SelectItem>
                    ))}
                  </div>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {showPersonSelector && persons.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-600">Associated person</Label>
          <Select value={selectedPersonId} onValueChange={(v) => setSelectedPersonId(v ?? "")}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select person (optional)…" />
            </SelectTrigger>
            <SelectContent>
              {persons.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} <span className="text-gray-400 text-xs">({p.role})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Existing document display */}
      {current && !replacing && (
        <div className="flex items-center justify-between rounded-lg border bg-gray-50 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <VerificationIcon status={current.verification_status} />
            <span className="truncate font-medium">{current.file_name}</span>
            <span className="text-xs text-gray-400 shrink-0">{formatBytes(current.file_size)}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-brand-blue"
              onClick={() => window.open(`/api/documents/${current.id}/download`, "_blank")}
            >
              <Eye className="h-3 w-3 mr-1" /> Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setReplacing(true)}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Replace
            </Button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      {(!current || replacing) && (
        <div
          {...getRootProps()}
          className={cn(
            "rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
            isDragActive
              ? "border-brand-blue bg-blue-50"
              : "border-gray-200 hover:border-brand-blue/50 hover:bg-gray-50"
          )}
          onClick={open}
        >
          <input {...getInputProps()} />
          <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          {uploading ? (
            <p className="text-sm text-gray-500">Uploading…</p>
          ) : isDragActive ? (
            <p className="text-sm text-brand-blue font-medium">Drop file here</p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Drag & drop or{" "}
                <span className="text-brand-blue font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">PDF, JPEG, PNG, WebP — max 10MB</p>
            </>
          )}
        </div>
      )}

      {replacing && (
        <button
          onClick={() => setReplacing(false)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          <X className="h-3 w-3" /> Cancel replace
        </button>
      )}
    </div>
  );
}
