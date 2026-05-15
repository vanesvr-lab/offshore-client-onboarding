"use client";

// B-120 — shared "Reference forms" panel rendered inside each Action
// subsection's expanded body. Two-row layout per attached reference form:
//
//   FSC Form A · v2025-01 · active        [Download blank ↓]
//   Submitted: filed_2026-05-12.pdf       [Upload submitted ↑]  Submitted 12 May 2026
//                                         [View history (3)]
//
// If `referenceForms` is empty, the component renders nothing — Action
// subsections without attached forms shouldn't surface an empty header.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Download,
  History,
  Loader2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";

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

export function ReferenceFormsPanel({
  serviceId,
  actionKey,
  referenceForms,
  submittedFormsByRefId,
}: Props) {
  if (referenceForms.length === 0) return null;

  return (
    <div className="border-t pt-3 mt-3 space-y-2" data-testid="reference-forms-panel">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Reference forms
      </p>
      <ul className="space-y-2">
        {referenceForms.map((form) => (
          <li key={form.id} className="rounded-md border bg-gray-50/50 px-3 py-2">
            <ReferenceFormRow
              serviceId={serviceId}
              actionKey={actionKey}
              form={form}
              submitted={submittedFormsByRefId[form.id] ?? []}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReferenceFormRow({
  serviceId,
  actionKey,
  form,
  submitted,
}: {
  serviceId: string;
  actionKey: string;
  form: ReferenceFormSummary;
  submitted: SubmittedFormSummary[];
}) {
  const router = useRouter();
  const [downloadingBlank, setDownloadingBlank] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...submitted].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [submitted],
  );
  const current = sorted[0] ?? null;
  const older = sorted.slice(1);

  async function onDownloadBlank() {
    setDownloadingBlank(true);
    try {
      const res = await fetch(`/api/admin/reference-forms/${form.id}/blank-download-url`);
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Could not download blank");
        return;
      }
      window.open(body.url, "_blank");
    } finally {
      setDownloadingBlank(false);
    }
  }

  async function onDownloadSubmitted(submittedId: string) {
    setDownloadingId(submittedId);
    try {
      const res = await fetch(`/api/admin/submitted-forms/${submittedId}/download-url`);
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Could not download submitted file");
        return;
      }
      window.open(body.url, "_blank");
    } finally {
      setDownloadingId(null);
    }
  }

  async function onUploadSubmitted(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("action_key", actionKey);
      fd.append("reference_form_id", form.id);
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
      setUploading(false);
    }
  }

  const inputId = `submitted-upload-${form.id}`;
  const hasCurrent = current !== null;
  const isReplaced =
    form.status === "deactivated" && form.replaced_by_id !== null;

  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-gray-800 truncate">{form.name}</span>
          {form.version_label && (
            <span className="text-xs text-gray-500">· {form.version_label}</span>
          )}
          <span
            className={
              form.status === "active"
                ? "text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
                : "text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
            }
          >
            {form.status === "active"
              ? "active"
              : isReplaced
                ? "replaced"
                : "deactivated"}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onDownloadBlank}
          disabled={downloadingBlank}
          className="h-7 text-xs shrink-0"
        >
          {downloadingBlank ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1" />
          )}
          Download blank
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 pl-1">
        <div className="text-xs text-gray-600 min-w-0">
          {hasCurrent ? (
            <>
              <span className="text-gray-500">Submitted:</span>{" "}
              <button
                type="button"
                onClick={() => onDownloadSubmitted(current!.id)}
                disabled={downloadingId === current!.id}
                className="underline hover:no-underline text-brand-navy"
              >
                {current!.file_name}
              </button>{" "}
              <span className="text-gray-400">
                · {formatDate(current!.uploaded_at)}
                {current!.uploaded_by_name ? ` by ${current!.uploaded_by_name}` : ""}
              </span>
            </>
          ) : (
            <span className="text-gray-500">Submitted: not yet uploaded</span>
          )}
        </div>

        <label
          htmlFor={inputId}
          className={
            uploading
              ? "h-7 inline-flex items-center px-2 text-xs rounded-md border bg-gray-50 text-gray-400 cursor-not-allowed shrink-0"
              : "h-7 inline-flex items-center px-2 text-xs rounded-md border bg-white hover:bg-gray-50 cursor-pointer shrink-0"
          }
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1" />
          )}
          {hasCurrent ? "Replace submitted" : "Upload submitted"}
        </label>
        <input
          id={inputId}
          type="file"
          accept=".pdf,.doc,.docx,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUploadSubmitted(file);
            e.target.value = "";
          }}
          disabled={uploading}
        />
      </div>

      {older.length > 0 && (
        <div className="pl-1">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700"
          >
            {historyOpen ? (
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 mr-1" />
            )}
            <History className="h-3 w-3 mr-1" />
            View history ({older.length})
          </button>
          {historyOpen && (
            <ul className="mt-1.5 space-y-1 text-xs text-gray-600 pl-5 border-l border-gray-200">
              {older.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onDownloadSubmitted(row.id)}
                    disabled={downloadingId === row.id}
                    className="underline hover:no-underline text-brand-navy truncate"
                  >
                    {row.file_name}
                  </button>
                  <span className="text-gray-400 shrink-0">
                    {formatDate(row.uploaded_at)}
                    {row.uploaded_by_name ? ` · ${row.uploaded_by_name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
