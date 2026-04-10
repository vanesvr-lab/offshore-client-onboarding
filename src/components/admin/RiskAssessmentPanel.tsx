"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, AlertTriangle, XCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { KycRecord } from "@/types";

interface RiskAssessmentPanelProps {
  kycRecordId: string;
  kycRecord: KycRecord;
}

type RiskRating = "low" | "medium" | "high" | "prohibited";

const RATING_COLORS: Record<RiskRating, string> = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  prohibited: "bg-red-100 text-red-800 border-red-200",
};

function StatusDot({ checked }: { checked: boolean }) {
  if (checked) return <span className="inline-block h-2 w-2 rounded-full bg-green-500" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-red-400" />;
}

export function RiskAssessmentPanel({ kycRecordId, kycRecord: initialRecord }: RiskAssessmentPanelProps) {
  const [record, setRecord] = useState<KycRecord>(initialRecord);
  const [saving, setSaving] = useState(false);

  async function save(fields: Partial<KycRecord>) {
    setSaving(true);
    try {
      const res = await fetch("/api/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId, fields }),
      });
      const data = await res.json() as { record?: KycRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setRecord((prev) => ({ ...prev, ...fields }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggleCheck(field: "sanctions_checked" | "adverse_media_checked" | "pep_verified") {
    const dateField = field === "sanctions_checked"
      ? "sanctions_checked_at"
      : field === "adverse_media_checked"
      ? "adverse_media_checked_at"
      : "pep_verified_at";
    const newVal = !record[field];
    save({
      [field]: newVal,
      [dateField]: newVal ? new Date().toISOString() : null,
    } as Partial<KycRecord>);
  }

  function updateNotes(field: "sanctions_notes" | "adverse_media_notes" | "pep_verified_notes", value: string) {
    setRecord((prev) => ({ ...prev, [field]: value }));
  }

  function saveNotes(field: "sanctions_notes" | "adverse_media_notes" | "pep_verified_notes") {
    save({ [field]: record[field] } as Partial<KycRecord>);
  }

  function setRiskRating(rating: RiskRating) {
    if (rating === record.risk_rating) return;
    setRecord((prev) => ({ ...prev, risk_rating: rating, risk_rating_justification: "" }));
  }

  async function saveRating() {
    if (!record.risk_rating) return;
    if (!record.risk_rating_justification?.trim()) {
      toast.error("A justification is required when setting a risk rating");
      return;
    }
    await save({
      risk_rating: record.risk_rating,
      risk_rating_justification: record.risk_rating_justification,
      risk_rated_at: new Date().toISOString(),
    });
    toast.success("Risk rating saved");
  }

  // Auto-generate flags
  const flags: { label: string; status: "ok" | "warn" | "error" }[] = [
    {
      label: `Sanctions screening: ${record.sanctions_checked ? "Done" : "NOT DONE"}`,
      status: record.sanctions_checked ? "ok" : "error",
    },
    {
      label: `Adverse media: ${record.adverse_media_checked ? "Done" : "NOT DONE"}`,
      status: record.adverse_media_checked ? "ok" : "error",
    },
    {
      label: `PEP verification: ${record.pep_verified ? "Done" : "NOT DONE"}`,
      status: record.pep_verified ? "ok" : (record.is_pep ? "error" : "warn"),
    },
    {
      label: `Risk rating: ${record.risk_rating ? record.risk_rating.toUpperCase() : "NOT SET"}`,
      status: record.risk_rating ? (record.risk_rating === "prohibited" ? "error" : "ok") : "error",
    },
    {
      label: `Source of funds: ${record.source_of_funds_description ? "Provided" : "NOT PROVIDED"}`,
      status: record.source_of_funds_description ? "ok" : "warn",
    },
  ];

  if (record.is_pep) {
    flags.push({
      label: `PEP declared by client — requires enhanced due diligence`,
      status: record.pep_verified ? "ok" : "error",
    });
  }

  const blockers = flags.filter((f) => f.status === "error").map((f) => f.label);

  return (
    <div className="space-y-5">
      {/* Risk Flags Summary */}
      <div className="rounded-lg border bg-gray-50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-brand-navy">Risk Flags</span>
        </div>
        {flags.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {f.status === "ok" && <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />}
            {f.status === "warn" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
            {f.status === "error" && <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
            <span className={f.status === "error" ? "text-red-700" : f.status === "warn" ? "text-amber-700" : "text-gray-600"}>
              {f.label}
            </span>
          </div>
        ))}
        {blockers.length > 0 && (
          <div className="border-t pt-2 mt-2">
            <p className="text-xs font-medium text-red-700">Cannot approve until:</p>
            <ul className="list-disc list-inside text-xs text-red-600 space-y-0.5 mt-1">
              {blockers.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Sanctions Screening */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-brand-navy">Sanctions Screening</Label>
          <div className="flex items-center gap-2">
            <StatusDot checked={record.sanctions_checked} />
            <span className="text-xs text-gray-500">{record.sanctions_checked ? "Checked" : "Not done"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={record.sanctions_checked}
            onCheckedChange={() => toggleCheck("sanctions_checked")}
            disabled={saving}
          />
          <span className="text-sm text-gray-700">Sanctions check completed</span>
          {record.sanctions_checked_at && (
            <span className="text-xs text-gray-400 ml-2">
              {new Date(record.sanctions_checked_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
        <Textarea
          value={record.sanctions_notes ?? ""}
          onChange={(e) => updateNotes("sanctions_notes", e.target.value)}
          onBlur={() => saveNotes("sanctions_notes")}
          rows={2}
          placeholder="Notes on sanctions screening result…"
          className="text-sm"
        />
      </div>

      {/* Adverse Media */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-brand-navy">Adverse Media Check</Label>
          <div className="flex items-center gap-2">
            <StatusDot checked={record.adverse_media_checked} />
            <span className="text-xs text-gray-500">{record.adverse_media_checked ? "Checked" : "Not done"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={record.adverse_media_checked}
            onCheckedChange={() => toggleCheck("adverse_media_checked")}
            disabled={saving}
          />
          <span className="text-sm text-gray-700">Adverse media check completed</span>
          {record.adverse_media_checked_at && (
            <span className="text-xs text-gray-400 ml-2">
              {new Date(record.adverse_media_checked_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
        <Textarea
          value={record.adverse_media_notes ?? ""}
          onChange={(e) => updateNotes("adverse_media_notes", e.target.value)}
          onBlur={() => saveNotes("adverse_media_notes")}
          rows={2}
          placeholder="Notes on adverse media check…"
          className="text-sm"
        />
      </div>

      {/* PEP Verification */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-brand-navy">PEP Verification</Label>
          <div className="flex items-center gap-2">
            <StatusDot checked={record.pep_verified} />
            <span className="text-xs text-gray-500">{record.pep_verified ? "Verified" : "Not done"}</span>
          </div>
        </div>
        {record.is_pep !== null && (
          <div className={cn(
            "rounded px-3 py-1.5 text-xs",
            record.is_pep ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-gray-50 text-gray-600"
          )}>
            Client declared: <strong>{record.is_pep ? "YES — PEP" : "No"}</strong>
            {record.pep_details && ` — ${record.pep_details}`}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            checked={record.pep_verified}
            onCheckedChange={() => toggleCheck("pep_verified")}
            disabled={saving}
          />
          <span className="text-sm text-gray-700">PEP status verified</span>
          {record.pep_verified_at && (
            <span className="text-xs text-gray-400 ml-2">
              {new Date(record.pep_verified_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
        <Textarea
          value={(record as unknown as Record<string, string>).pep_verified_notes ?? ""}
          onChange={(e) => updateNotes("pep_verified_notes", e.target.value)}
          onBlur={() => saveNotes("pep_verified_notes")}
          rows={2}
          placeholder="Notes on PEP verification…"
          className="text-sm"
        />
      </div>

      {/* Overall Risk Rating */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-brand-navy">Overall Risk Rating</Label>
        <div className="flex gap-2 flex-wrap">
          {(["low", "medium", "high", "prohibited"] as RiskRating[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRiskRating(r)}
              className={cn(
                "px-3 py-1.5 rounded-full border text-xs font-medium capitalize transition-all",
                record.risk_rating === r
                  ? RATING_COLORS[r]
                  : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        {record.risk_rating && (
          <>
            <Textarea
              value={record.risk_rating_justification ?? ""}
              onChange={(e) => setRecord((prev) => ({ ...prev, risk_rating_justification: e.target.value }))}
              rows={2}
              placeholder="Justification for this risk rating (required)…"
              className="text-sm"
            />
            {record.risk_rated_at && (
              <p className="text-xs text-gray-400">
                Rated {new Date(record.risk_rated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                {record.risk_rated_by && ` by ${record.risk_rated_by}`}
              </p>
            )}
            <Button
              size="sm"
              onClick={saveRating}
              disabled={saving || !record.risk_rating_justification?.trim()}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              Save Rating
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
