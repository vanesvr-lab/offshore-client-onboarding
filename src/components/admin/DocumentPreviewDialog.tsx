"use client";

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import type { VerificationStatus } from "@/types";

interface DocumentPreviewDialogProps {
  documentId: string;
  fileName: string;
  mimeType: string;
  uploadedAt?: string;
  verificationStatus?: VerificationStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function DocumentPreviewDialog({
  documentId,
  fileName,
  mimeType,
  uploadedAt,
  verificationStatus,
  open,
  onOpenChange,
}: DocumentPreviewDialogProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSignedUrl(null);

    fetch(`/api/documents/${documentId}/download`)
      .then((r) => r.json())
      .then((data: { url?: string; error?: string }) => {
        if (data.url) {
          setSignedUrl(data.url);
        } else {
          setError(data.error ?? "Could not load document");
        }
      })
      .catch(() => setError("Could not load document"))
      .finally(() => setLoading(false));
  }, [open, documentId]);

  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent
        className="max-w-4xl w-full p-0 flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <DialogTitle className="text-base text-brand-navy truncate max-w-[400px]">
                {fileName}
              </DialogTitle>
              {verificationStatus && (
                <VerificationBadge status={verificationStatus} />
              )}
              {uploadedAt && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  Uploaded {formatDate(uploadedAt)}
                </span>
              )}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="text-gray-400 hover:text-gray-600 ml-4 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Preview body */}
        <div className="flex-1 overflow-hidden" style={{ height: "calc(80vh - 112px)" }}>
          {loading && (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              Loading preview…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-sm text-brand-danger">
              {error}
            </div>
          )}
          {signedUrl && isImage && (
            <div className="flex items-center justify-center h-full bg-gray-100 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signedUrl}
                alt={fileName}
                className="max-h-full max-w-full object-contain rounded shadow"
              />
            </div>
          )}
          {signedUrl && isPdf && (
            <iframe
              src={signedUrl}
              className="w-full h-full border-0"
              title={fileName}
            />
          )}
          {signedUrl && !isImage && !isPdf && (
            <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 gap-3">
              <p>Preview not available for this file type.</p>
              <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download to view
                </Button>
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex-shrink-0 flex items-center justify-end gap-2">
          {signedUrl && (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" download={fileName}>
              <Button variant="outline" size="sm">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            </a>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
