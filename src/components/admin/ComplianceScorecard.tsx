"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calculateComplianceScore } from "@/lib/utils/complianceScoring";
import type {
  KycRecord,
  DocumentRecord,
  DueDiligenceLevel,
  DueDiligenceRequirement,
  SectionScore,
} from "@/types";

interface ComplianceScorecardProps {
  clientId: string;
  kycRecords: KycRecord[];
  documents: DocumentRecord[];
  dueDiligenceLevel: DueDiligenceLevel;
  requirements: DueDiligenceRequirement[];
}

const LEVEL_LABELS: Record<DueDiligenceLevel, string> = {
  sdd: "SDD — Simplified",
  cdd: "CDD — Standard",
  edd: "EDD — Enhanced",
};

function SectionBlock({ section }: { section: SectionScore }) {
  const [expanded, setExpanded] = useState(false);
  const pct = section.total > 0 ? Math.round((section.filled / section.total) * 100) : 0;
  const isComplete = section.filled === section.total;

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isComplete ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <span className="text-sm font-medium text-brand-navy">{section.name}</span>
          <span className="text-xs text-gray-500">{section.filled}/{section.total}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isComplete ? "bg-green-500" : "bg-brand-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-600 w-8 text-right">{pct}%</span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 grid grid-cols-2 gap-1.5">
          {section.items.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              {item.met ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              )}
              <span className={`text-xs ${item.met ? "text-gray-600" : "text-red-600"}`}>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ComplianceScorecard({
  clientId,
  kycRecords,
  documents,
  dueDiligenceLevel: initialLevel,
  requirements,
}: ComplianceScorecardProps) {
  const [level, setLevel] = useState<DueDiligenceLevel>(initialLevel);
  const [changingLevel, setChangingLevel] = useState(false);

  // Use primary individual record for scoring (first one)
  const primaryRecord =
    kycRecords.find((r) => r.record_type === "individual") ?? kycRecords[0] ?? null;

  const score = primaryRecord
    ? calculateComplianceScore(primaryRecord, documents, level, requirements)
    : { overallPercentage: 0, sections: [], canApprove: false, blockers: [] };

  async function handleLevelChange(newLevel: string) {
    if (!newLevel || newLevel === level) return;
    setChangingLevel(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/due-diligence`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: newLevel }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update level");
      setLevel(newLevel as DueDiligenceLevel);
      toast.success(`Due diligence level changed to ${LEVEL_LABELS[newLevel as DueDiligenceLevel]}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update level");
    } finally {
      setChangingLevel(false);
    }
  }

  const isComplete = score.overallPercentage === 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base text-brand-navy">Compliance Scorecard</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Due Diligence:</span>
            <Select value={level} onValueChange={(v) => { void handleLevelChange(v ?? ""); }} disabled={changingLevel}>
              <SelectTrigger className="h-7 text-xs w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sdd" className="text-xs">SDD — Simplified</SelectItem>
                <SelectItem value="cdd" className="text-xs">CDD — Standard</SelectItem>
                <SelectItem value="edd" className="text-xs">EDD — Enhanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Overall compliance</span>
            <span className={`text-sm font-semibold ${isComplete ? "text-green-600" : "text-brand-navy"}`}>
              {score.overallPercentage}%
            </span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isComplete ? "bg-green-500" : score.overallPercentage >= 70 ? "bg-brand-accent" : "bg-amber-500"
              }`}
              style={{ width: `${score.overallPercentage}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {!primaryRecord ? (
          <p className="text-sm text-gray-400 text-center py-4">No KYC record found for this client.</p>
        ) : score.sections.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No requirements loaded.</p>
        ) : (
          score.sections.map((section) => (
            <SectionBlock key={section.name} section={section} />
          ))
        )}

        {/* Blockers */}
        {score.blockers.length > 0 && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 mt-2">
            <p className="text-xs font-medium text-red-700 mb-2 flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Cannot approve until:
            </p>
            <ul className="space-y-0.5 list-disc list-inside">
              {score.blockers.slice(0, 8).map((b) => (
                <li key={b} className="text-xs text-red-600">{b}</li>
              ))}
              {score.blockers.length > 8 && (
                <li className="text-xs text-red-400">+{score.blockers.length - 8} more</li>
              )}
            </ul>
          </div>
        )}

        {score.canApprove && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <p className="text-xs font-medium text-green-700">All compliance requirements met — ready for approval</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
