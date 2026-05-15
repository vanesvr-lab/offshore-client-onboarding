"use client";

// B-120 — shared "Reference forms" panel rendered inside each Action
// subsection's expanded body.
//
// B-122 — switched from a card-per-form layout to a four-column table:
//   • Reference form: name · version · 👁 (preview blank) · ↓ (download blank)
//   • Status:         active / replaced / deactivated chip
//   • Submitted file: filename · 👁 · ↓ · ↑  (or "Upload submitted" button
//                     in empty state — Batch 3 replaces the empty-state
//                     button with a drop-zone)
//   • Submitted date: latest upload date + small "history (N)" link when
//                     older versions exist
//
// If `referenceForms` is empty, the component renders nothing.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpFromLine,
  Download,
  Eye,
  History,
  Loader2,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentPreviewDialog } from "@/components/admin/DocumentPreviewDialog";
import { SubmittedFileDropZone } from "./SubmittedFileDropZone";

export interface ReferenceFormSummary {
  id: string;
  name: string;
  version_label: string | null;
  status: "active" | "deactivated";
  replaced_by_id: string | null;
}

export interface SubmittedFormSummary {
  id: string;
  reference_form_id: string;
  file_name: string;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

interface Props {
  serviceId: string;
  actionKey: string;
  referenceForms: ReferenceFormSummary[];
  submittedFormsByRefId: Record<string, SubmittedFormSummary[]>;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// Infer MIME from a filename's extension. Used to pick the right preview
// surface inside DocumentPreviewDialog (image vs pdf vs fallback download).
// Conservative: defaults to application/octet-stream so unrecognised
// extensions surface the "download to view" fallback.
function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "tiff" || ext === "tif") return "image/tiff";
  if (ext === "doc") return "application/msword";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

interface PreviewTarget {
  /** Stable key for the preview dialog so React unmounts cleanly. */
  key: string;
  /** Endpoint that returns `{ url }`. */
  endpoint: string;
  fileName: string;
  mimeType: string;
}

export function ReferenceFormsPanel({
  serviceId,
  actionKey,
  referenceForms,
  submittedFormsByRefId,
}: Props) {
  const router = useRouter();
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{
    form: ReferenceFormSummary;
    rows: SubmittedFormSummary[];
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (referenceForms.length === 0) return null;

  async function openSignedUrlInNewTab(
    endpoint: string,
    busyKey: string,
    errorLabel: string,
  ) {
    setBusyId(busyKey);
    try {
      const res = await fetch(endpoint);
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? errorLabel);
        return;
      }
      window.open(body.url, "_blank");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadSubmitted(formId: string, file: File) {
    setBusyId(`upload-${formId}`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("action_key", actionKey);
      fd.append("reference_form_id", formId);
      const res = await fetch(`/api/admin/services/${serviceId}/submitted-forms`, {
        method: "POST",
        body: fd,
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Upload failed");
        return;
      }
      toast.success("Submitted copy uploaded");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-t pt-3 mt-3 space-y-2" data-testid="reference-forms-panel">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Reference forms
      </p>
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Reference form</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">Submitted file</th>
              <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">
                Submitted date
              </th>
            </tr>
          </thead>
          <tbody>
            {referenceForms.map((form) => {
              const submitted = submittedFormsByRefId[form.id] ?? [];
              const sorted = [...submitted].sort((a, b) =>
                b.uploaded_at.localeCompare(a.uploaded_at),
              );
              const current = sorted[0] ?? null;
              const older = sorted.slice(1);
              const isReplaced =
                form.status === "deactivated" && form.replaced_by_id !== null;
              return (
                <tr key={form.id} className="border-t hover:bg-gray-50/50 align-top">
                  {/* Column 1 — name + inline preview / download icons */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="font-medium text-gray-800 truncate"
                        title={form.name}
                      >
                        {form.name}
                      </span>
                      {form.version_label && (
                        <span
                          className="text-[10px] text-gray-400 shrink-0"
                          title={`Version ${form.version_label}`}
                        >
                          · {form.version_label}
                        </span>
                      )}
                      <IconBtn
                        label="Preview blank"
                        busy={busyId === `preview-blank-${form.id}`}
                        onClick={() =>
                          setPreviewTarget({
                            key: `blank-${form.id}`,
                            endpoint: `/api/admin/reference-forms/${form.id}/blank-download-url`,
                            fileName: `${form.name}${
                              form.version_label ? ` (${form.version_label})` : ""
                            }`,
                            mimeType: "application/pdf",
                          })
                        }
                      >
                        <Eye className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        label="Download blank"
                        busy={busyId === `dl-blank-${form.id}`}
                        onClick={() =>
                          openSignedUrlInNewTab(
                            `/api/admin/reference-forms/${form.id}/blank-download-url`,
                            `dl-blank-${form.id}`,
                            "Could not download blank",
                          )
                        }
                      >
                        <Download className="h-4 w-4" />
                      </IconBtn>
                    </div>
                  </td>

                  {/* Column 2 — status chip */}
                  <td className="px-3 py-2">
                    <span
                      className={
                        form.status === "active"
                          ? "text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium"
                          : "text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium"
                      }
                    >
                      {form.status === "active"
                        ? "active"
                        : isReplaced
                          ? "replaced"
                          : "deactivated"}
                    </span>
                  </td>

                  {/* Column 3 — submitted file (current) */}
                  <td className="px-3 py-2">
                    {current ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="text-gray-700 truncate"
                          title={current.file_name}
                        >
                          {current.file_name}
                        </span>
                        <IconBtn
                          label="Preview submitted"
                          busy={busyId === `preview-sub-${current.id}`}
                          onClick={() =>
                            setPreviewTarget({
                              key: `sub-${current.id}`,
                              endpoint: `/api/admin/submitted-forms/${current.id}/download-url`,
                              fileName: current.file_name,
                              mimeType: mimeFromFilename(current.file_name),
                            })
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          label="Download submitted"
                          busy={busyId === `dl-sub-${current.id}`}
                          onClick={() =>
                            openSignedUrlInNewTab(
                              `/api/admin/submitted-forms/${current.id}/download-url`,
                              `dl-sub-${current.id}`,
                              "Could not download submitted",
                            )
                          }
                        >
                          <Download className="h-4 w-4" />
                        </IconBtn>
                        <UploadIconBtn
                          label="Upload new version (replaces current)"
                          formId={form.id}
                          busy={busyId === `upload-${form.id}`}
                          onUpload={uploadSubmitted}
                        >
                          <ArrowUpFromLine className="h-4 w-4" />
                        </UploadIconBtn>
                      </div>
                    ) : (
                      <SubmittedFileDropZone
                        serviceId={serviceId}
                        actionKey={actionKey}
                        referenceFormId={form.id}
                        onUploaded={() => router.refresh()}
                      />
                    )}
                  </td>

                  {/* Column 4 — submitted date + history */}
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    {current ? (
                      <div className="flex flex-col gap-0.5">
                        <span>{formatDate(current.uploaded_at)}</span>
                        {older.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setHistoryTarget({ form, rows: sorted })
                            }
                            className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700"
                          >
                            <History className="h-3 w-3" />
                            history ({older.length})
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Preview dialog — reuses DocumentPreviewDialog with the per-form
          signed-URL endpoint instead of the documents-table lookup. */}
      {previewTarget && (
        <DocumentPreviewDialog
          documentId={previewTarget.key}
          fileName={previewTarget.fileName}
          mimeType={previewTarget.mimeType}
          urlEndpoint={previewTarget.endpoint}
          open={previewTarget !== null}
          onOpenChange={(o) => {
            if (!o) setPreviewTarget(null);
          }}
        />
      )}

      {/* History modal — lists older submitted versions for one form.
          Reuses the standard Dialog primitive; no new viewer needed
          beyond the small list. */}
      {historyTarget && (
        <HistoryDialog
          open
          form={historyTarget.form}
          rows={historyTarget.rows}
          busyId={busyId}
          onClose={() => setHistoryTarget(null)}
          onPreview={(row) =>
            setPreviewTarget({
              key: `sub-${row.id}`,
              endpoint: `/api/admin/submitted-forms/${row.id}/download-url`,
              fileName: row.file_name,
              mimeType: mimeFromFilename(row.file_name),
            })
          }
          onDownload={(row) =>
            openSignedUrlInNewTab(
              `/api/admin/submitted-forms/${row.id}/download-url`,
              `dl-sub-${row.id}`,
              "Could not download submitted",
            )
          }
        />
      )}
    </div>
  );
}

function IconBtn({
  label,
  busy,
  onClick,
  children,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className="text-gray-500 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

function UploadIconBtn({
  label,
  formId,
  busy,
  onUpload,
  children,
}: {
  label: string;
  formId: string;
  busy: boolean;
  onUpload: (formId: string, file: File) => void;
  children: React.ReactNode;
}) {
  const inputId = `submitted-replace-${formId}`;
  return (
    <>
      <label
        htmlFor={inputId}
        title={label}
        aria-label={label}
        className={
          busy
            ? "text-gray-300 cursor-not-allowed shrink-0"
            : "text-gray-500 hover:text-gray-900 cursor-pointer shrink-0"
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".pdf,.doc,.docx,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(formId, file);
          e.target.value = "";
        }}
        disabled={busy}
      />
    </>
  );
}

function HistoryDialog({
  open,
  form,
  rows,
  busyId,
  onClose,
  onPreview,
  onDownload,
}: {
  open: boolean;
  form: ReferenceFormSummary;
  rows: SubmittedFormSummary[];
  busyId: string | null;
  onClose: () => void;
  onPreview: (row: SubmittedFormSummary) => void;
  onDownload: (row: SubmittedFormSummary) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[min(100vw-2rem,40rem)]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Submission history — {form.name}
            {form.version_label ? ` · ${form.version_label}` : ""}
          </DialogTitle>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-gray-500">
            <tr className="border-b">
              <th className="text-left py-2 font-semibold">File</th>
              <th className="text-left py-2 font-semibold">Uploaded</th>
              <th className="text-left py-2 font-semibold">By</th>
              <th className="text-right py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={row.id} className="hover:bg-gray-50/50">
                <td className="py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate" title={row.file_name}>
                      {row.file_name}
                    </span>
                    {i === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">
                        current
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 text-gray-600 whitespace-nowrap">
                  {formatDate(row.uploaded_at)}
                </td>
                <td className="py-2 text-gray-600">
                  {row.uploaded_by_name ?? "—"}
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-end gap-2">
                    <IconBtn
                      label="Preview"
                      busy={busyId === `preview-sub-${row.id}`}
                      onClick={() => onPreview(row)}
                    >
                      <Eye className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                      label="Download"
                      busy={busyId === `dl-sub-${row.id}`}
                      onClick={() => onDownload(row)}
                    >
                      <Download className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}

