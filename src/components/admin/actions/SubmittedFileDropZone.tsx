"use client";

// B-122 — empty-state cell for the Submitted file column on the
// Reference Forms table. Replaces the plain "Upload submitted" button so
// admins get a clearer affordance:
//   • Click anywhere in the dashed rectangle → opens the OS file picker.
//   • Drag a file over → border + bg flip blue to confirm the drop target.
//   • Drop a file → uploads it as the submitted form (same endpoint as
//     the click-to-browse path).
//
// Client-side validation (MIME + extension) keeps the drop UX tight, but
// the server route is the actual authority — it re-checks MIME + size.
//
// Once a file is uploaded the parent swaps this cell for the
// filename + icons row, so the drop-zone is strictly the no-current-file
// surface. Replacing an existing submission uses the explicit ↑ icon on
// the uploaded-state row (more deliberate, no accidental drop swaps).

import { useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";

import {
  isAllowedSubmittedFile,
  SUBMITTED_FILE_ACCEPT_ATTR,
} from "@/lib/services/submittedFileValidation";

// Re-exported so existing import paths via the component file keep working.
export { isAllowedSubmittedFile };

interface Props {
  serviceId: string;
  actionKey: string;
  referenceFormId: string;
  /** Called with the parsed JSON on a successful upload so the parent
   *  can splice the new row into local state without a router refresh. */
  onUploaded?: (submittedFormRow: unknown) => void;
}

export function SubmittedFileDropZone({
  serviceId,
  actionKey,
  referenceFormId,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    if (!isAllowedSubmittedFile(file)) {
      toast.error("File type not allowed. Use PDF, DOC/DOCX, JPEG, or PNG.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("action_key", actionKey);
      fd.append("reference_form_id", referenceFormId);
      const res = await fetch(`/api/admin/services/${serviceId}/submitted-forms`, {
        method: "POST",
        body: fd,
      });
      const body = (await res.json()) as { submittedForm?: unknown; error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Upload failed");
        return;
      }
      toast.success("Submitted copy uploaded");
      onUploaded?.(body.submittedForm);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleClick() {
    if (uploading) return;
    inputRef.current?.click();
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (uploading) return;
    e.preventDefault();
    e.stopPropagation();
    if (!dragOver) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    void upload(file);
  }

  return (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={uploading ? -1 : 0}
      aria-label="Upload submitted file — click to browse or drop a file"
      data-testid="submitted-drop-zone"
      className={
        "flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
        (uploading
          ? "cursor-not-allowed border-gray-300 bg-gray-50 text-gray-400"
          : dragOver
            ? "cursor-copy border-blue-400 bg-blue-50/60 text-blue-700"
            : "cursor-pointer border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-500")
      }
    >
      {uploading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Paperclip className="h-3.5 w-3.5" />
      )}
      <span>{uploading ? "Uploading…" : "Click to browse or drop file"}</span>
      <input
        ref={inputRef}
        type="file"
        accept={SUBMITTED_FILE_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
        disabled={uploading}
      />
    </div>
  );
}
