"use client";

import { useMemo, useState } from "react";
import { Sparkles, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { KYC_PREFILLABLE_FIELDS } from "@/lib/constants/prefillFields";
import type {
  AiExtractionField,
  DocumentRecord,
  DocumentType,
  VerificationResult,
} from "@/types";

interface KycLike {
  id: string;
  [key: string]: unknown;
}

interface Props {
  doc: Pick<
    DocumentRecord,
    "id" | "verification_result" | "prefill_dismissed_at"
  >;
  docType: Pick<DocumentType, "name" | "ai_extraction_fields">;
  /** The KYC record the banner can prefill into. */
  kycRecord: KycLike | null;
  /** Supplementary lookup — if a target field lives on client_profiles (full_name/address), look here too. */
  profileValues?: Record<string, unknown>;
  onApplied?: (fields: Record<string, unknown>) => void;
  onDismiss?: () => void;
  className?: string;
}

type ConflictMode = "keep_mine" | "overwrite_all";

const PREFILLABLE = new Set<string>(KYC_PREFILLABLE_FIELDS);

function humanLabel(label?: string, key?: string): string {
  if (label && label.trim()) return label;
  if (!key) return "";
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AiPrefillBanner({
  doc,
  docType,
  kycRecord,
  profileValues,
  onApplied,
  onDismiss,
  className,
}: Props) {
  const [localDismissed, setLocalDismissed] = useState(false);
  const [conflictMode, setConflictMode] = useState<ConflictMode>("keep_mine");
  const [saving, setSaving] = useState(false);

  const applicable = useMemo(() => {
    const result = doc.verification_result as VerificationResult | null;
    const extracted = result?.extracted_fields ?? {};
    const fields = (docType.ai_extraction_fields ?? []) as AiExtractionField[];
    return fields
      .map((f) => {
        const prefill = f.prefill_field;
        if (!prefill || !PREFILLABLE.has(prefill)) return null;
        const value = extracted[f.key];
        if (value === undefined || value === null || value === "") return null;
        return { field: f, prefillTarget: prefill, value: String(value) };
      })
      .filter((x): x is { field: AiExtractionField; prefillTarget: string; value: string } => x !== null);
  }, [doc.verification_result, docType.ai_extraction_fields]);

  if (localDismissed) return null;
  if (doc.prefill_dismissed_at) return null;
  if (applicable.length === 0) return null;

  function getCurrent(target: string): unknown {
    if (kycRecord && target in kycRecord) return kycRecord[target];
    if (profileValues && target in profileValues) return profileValues[target];
    return undefined;
  }

  async function handleApply() {
    if (!kycRecord?.id) {
      toast.error("Cannot prefill — no KYC record is attached to this document");
      return;
    }
    setSaving(true);
    try {
      const fields: Record<string, unknown> = {};
      for (const a of applicable) {
        const current = getCurrent(a.prefillTarget);
        const isEmpty =
          current === null || current === undefined || (typeof current === "string" && current.trim() === "");
        if (conflictMode === "overwrite_all" || isEmpty) {
          fields[a.prefillTarget] = a.value;
        }
      }

      if (Object.keys(fields).length > 0) {
        const saveRes = await fetch("/api/profiles/kyc/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kycRecordId: kycRecord.id, fields }),
        });
        if (!saveRes.ok) {
          const d = (await saveRes.json()) as { error?: string };
          throw new Error(d.error ?? "Save failed");
        }
      }

      // Mark the banner as dismissed regardless of whether anything was written.
      await fetch(`/api/documents/${doc.id}/dismiss-prefill`, { method: "POST" });

      toast.success(
        Object.keys(fields).length === 0
          ? "Nothing to prefill — your form already has values"
          : `Prefilled ${Object.keys(fields).length} field${Object.keys(fields).length === 1 ? "" : "s"}`
      );

      setLocalDismissed(true);
      onApplied?.(fields);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Prefill failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    try {
      await fetch(`/api/documents/${doc.id}/dismiss-prefill`, { method: "POST" });
      setLocalDismissed(true);
      onDismiss?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={cn(
        "relative rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-3.5",
        className
      )}
    >
      <button
        type="button"
        onClick={() => void handleSkip()}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        aria-label="Dismiss"
        disabled={saving}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 rounded-full bg-blue-100 p-1">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-navy">
            We read your {docType.name}.
          </p>
          <p className="text-[11px] text-gray-600 mb-2">
            Apply the values below to your KYC form in one click.
          </p>

          <div className="rounded-md border border-blue-100 bg-white/70 px-2.5 py-1.5 space-y-1 text-xs">
            {applicable.map(({ field, value }) => (
              <div key={field.key} className="flex gap-2">
                <span className="text-gray-500 min-w-[130px]">
                  {humanLabel(field.label, field.key)}:
                </span>
                <span className="text-gray-900 font-medium truncate">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span>When your form has values</span>
              <Select
                value={conflictMode}
                onValueChange={(v) =>
                  setConflictMode((v as ConflictMode) ?? "keep_mine")
                }
              >
                <SelectTrigger className="h-7 text-xs w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep_mine">keep mine</SelectItem>
                  <SelectItem value="overwrite_all">overwrite all</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => void handleSkip()}
                disabled={saving}
              >
                Skip
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-brand-navy hover:bg-brand-blue gap-1"
                onClick={() => void handleApply()}
                disabled={saving}
              >
                <Check className="h-3 w-3" />
                {saving ? "Applying…" : "Apply"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiPrefillBanner;
