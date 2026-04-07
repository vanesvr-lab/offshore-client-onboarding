"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import type { VerificationResult } from "@/types";

interface FlaggedDoc {
  id: string;
  application_id: string;
  file_name: string | null;
  verification_result: VerificationResult | null;
  document_requirements?: { name: string; category: string } | null;
}

interface FlaggedDiscrepanciesCardProps {
  applicationId: string;
  flaggedDocs: FlaggedDoc[];
}

function DocRow({
  doc,
  applicationId,
  onOverride,
}: {
  doc: FlaggedDoc;
  applicationId: string;
  onOverride: (id: string) => void;
}) {
  const [overriding, setOverriding] = useState(false);
  const router = useRouter();

  const flags = doc.verification_result?.flags ?? [];
  const failedChecks = (doc.verification_result?.match_results ?? []).filter(
    (r) => !r.passed
  );

  async function handleOverrideToPass() {
    setOverriding(true);
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict: "pass", note: "Manually overridden to pass by reviewer" }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Override failed");
      }
      toast.success("Document overridden to verified");
      onOverride(doc.id);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Override failed");
    } finally {
      setOverriding(false);
    }
  }

  return (
    <div className="rounded-lg border border-brand-danger/20 bg-red-50/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-brand-danger mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {doc.document_requirements?.name ?? doc.file_name ?? "Document"}
            </p>
            <p className="text-xs text-gray-500 capitalize">
              {doc.document_requirements?.category ?? ""}
            </p>
          </div>
        </div>
        <Link
          href={`/admin/applications/${applicationId}/documents/${doc.id}`}
          className="text-xs text-brand-blue hover:underline flex items-center gap-1 shrink-0"
        >
          View <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="space-y-1">
          {flags.map((flag, i) => (
            <p key={i} className="text-xs text-brand-danger bg-red-100 rounded px-2 py-1">
              {flag}
            </p>
          ))}
        </div>
      )}

      {/* Failed match checks */}
      {failedChecks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-600">Field discrepancies:</p>
          {failedChecks.map((check, i) => (
            <div key={i} className="grid grid-cols-2 gap-x-3 text-xs rounded bg-white border px-2 py-1.5">
              <div>
                <p className="text-gray-400 text-[10px] uppercase tracking-wide">Expected</p>
                <p className="font-medium text-gray-700 truncate">{check.expected || "—"}</p>
              </div>
              <div>
                <p className="text-gray-400 text-[10px] uppercase tracking-wide">Found</p>
                <p className="font-medium text-brand-danger truncate">{check.found || "—"}</p>
              </div>
              {check.note && (
                <p className="col-span-2 text-gray-500 text-[10px] mt-1">{check.note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 text-xs bg-brand-success hover:bg-brand-success/90 text-white gap-1"
          onClick={handleOverrideToPass}
          disabled={overriding}
        >
          <CheckCircle2 className="h-3 w-3" />
          {overriding ? "Overriding…" : "Override to Pass"}
        </Button>
        <Link href={`/admin/applications/${applicationId}/documents/${doc.id}`}>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
          >
            Request Re-upload
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function FlaggedDiscrepanciesCard({
  applicationId,
  flaggedDocs: initialDocs,
}: FlaggedDiscrepanciesCardProps) {
  const [docs, setDocs] = useState(initialDocs);

  function removeDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  if (docs.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-4 text-sm text-brand-success">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <span>No discrepancies detected — all documents clear.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map((doc) => (
        <DocRow
          key={doc.id}
          doc={doc}
          applicationId={applicationId}
          onOverride={removeDoc}
        />
      ))}
    </div>
  );
}
