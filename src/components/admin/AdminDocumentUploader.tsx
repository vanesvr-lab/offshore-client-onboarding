"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DocumentUploadStep } from "@/components/client/DocumentUploadStep";
import { Upload } from "lucide-react";
import type { DocumentRequirement, DocumentUpload } from "@/types";

interface AdminDocumentUploaderProps {
  applicationId: string;
  requirements: DocumentRequirement[];
  existingUploads: DocumentUpload[];
}

/**
 * Admin-side document uploader for the application detail page.
 * Lets an admin pick a document requirement and upload a file on behalf
 * of the client. Reuses the same DocumentUploadStep + upload API as the
 * client wizard.
 */
export function AdminDocumentUploader({
  applicationId,
  requirements,
  existingUploads,
}: AdminDocumentUploaderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedReqId, setSelectedReqId] = useState<string>("");

  const selectedReq = requirements.find((r) => r.id === selectedReqId) ?? null;
  const existingUpload =
    existingUploads.find((u) => u.requirement_id === selectedReqId) ?? null;

  function handleClose(nextOpen: boolean) {
    // Block outside-click close (consistent with other admin dialogs);
    // only close on explicit cancel
    if (nextOpen) setOpen(true);
  }

  function handleDone() {
    setOpen(false);
    setSelectedReqId("");
    router.refresh();
  }

  if (requirements.length === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Upload className="h-3.5 w-3.5" />
        Upload Document
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload document on behalf of client</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Document type</Label>
              <Select
                value={selectedReqId}
                onValueChange={(v) => setSelectedReqId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a document requirement…" />
                </SelectTrigger>
                <SelectContent>
                  {requirements.map((req) => {
                    const uploaded = existingUploads.some(
                      (u) => u.requirement_id === req.id
                    );
                    return (
                      <SelectItem key={req.id} value={req.id}>
                        {req.name}
                        {uploaded && " (replace)"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedReq && (
              <div className="rounded-lg border bg-gray-50 p-4">
                <DocumentUploadStep
                  requirement={selectedReq}
                  applicationId={applicationId}
                  existingUpload={existingUpload}
                  onUploadComplete={() => {
                    // Refresh the page so the parent reflects the new upload
                    router.refresh();
                  }}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleDone}>
                {selectedReq ? "Done" : "Cancel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
