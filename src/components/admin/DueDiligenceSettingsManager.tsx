"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { DueDiligenceSettings, DueDiligenceRequirement } from "@/types";

interface DueDiligenceSettingsManagerProps {
  settings: DueDiligenceSettings[];
  requirements: DueDiligenceRequirement[];
}

const LEVEL_ORDER = ["sdd", "cdd", "edd"] as const;
const LEVEL_DISPLAY = {
  sdd: { label: "SDD", subtitle: "Simplified Due Diligence", description: "For low-risk clients. Minimal documentation." },
  cdd: { label: "CDD", subtitle: "Standard Customer Due Diligence", description: "Default level. Standard documentation and PEP checks." },
  edd: { label: "EDD", subtitle: "Enhanced Due Diligence", description: "For high-risk clients. Requires senior management approval." },
};

const REQ_TYPE_LABELS = {
  field: "Fields",
  document: "Documents",
  admin_check: "Admin Checks",
};

function RequirementsList({
  requirements,
  level,
}: {
  requirements: DueDiligenceRequirement[];
  level: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Only show requirements specific to this level (not cumulative)
  const levelReqs = requirements.filter((r) => r.level === level || r.level === "basic");
  const grouped = levelReqs.reduce<Record<string, DueDiligenceRequirement[]>>((acc, r) => {
    const type = r.requirement_type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Hide" : "View"} requirements ({levelReqs.length})
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {(["field", "document", "admin_check"] as const).map((type) => {
            const reqs = grouped[type] ?? [];
            if (reqs.length === 0) return null;
            return (
              <div key={type}>
                <p className="text-xs font-medium text-gray-500 mb-1">{REQ_TYPE_LABELS[type]}</p>
                <div className="space-y-0.5">
                  {reqs.map((r) => (
                    <div key={r.id} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                      <span className="text-xs text-gray-600">{r.label}</span>
                      {r.level === "basic" && (
                        <span className="text-[10px] text-gray-400">(basic)</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LevelCard({
  setting,
  requirements,
}: {
  setting: DueDiligenceSettings;
  requirements: DueDiligenceRequirement[];
}) {
  const [autoApprove, setAutoApprove] = useState(setting.auto_approve);
  const [requiresSenior, setRequiresSenior] = useState(setting.requires_senior_approval);
  const [saving, setSaving] = useState(false);

  const display = LEVEL_DISPLAY[setting.level];

  async function patchSetting(update: Partial<DueDiligenceSettings>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/due-diligence/settings/${setting.level}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Setting saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      // Revert on error
      if ("auto_approve" in update) setAutoApprove(setting.auto_approve);
      if ("requires_senior_approval" in update) setRequiresSenior(setting.requires_senior_approval);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-brand-navy flex items-center gap-2">
              <span className="bg-brand-navy text-white text-xs px-2 py-0.5 rounded uppercase tracking-wide">
                {display.label}
              </span>
              {display.subtitle}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">{display.description}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Auto-approve toggle */}
        <div className="flex items-center justify-between py-2 border-t">
          <div>
            <Label className="text-sm font-medium">Auto-approve</Label>
            <p className="text-xs text-gray-500">
              Automatically approve KYC when all compliance requirements are met
            </p>
          </div>
          <Switch
            checked={autoApprove}
            disabled={saving}
            onCheckedChange={(checked) => {
              setAutoApprove(checked);
              void patchSetting({ auto_approve: checked });
            }}
          />
        </div>

        {/* Senior management approval toggle */}
        <div className="flex items-center justify-between py-2 border-t">
          <div>
            <Label className="text-sm font-medium">Requires senior management approval</Label>
            <p className="text-xs text-gray-500">
              Compliance officer must get senior sign-off before approving
            </p>
          </div>
          <Switch
            checked={requiresSenior}
            disabled={saving}
            onCheckedChange={(checked) => {
              setRequiresSenior(checked);
              void patchSetting({ requires_senior_approval: checked });
            }}
          />
        </div>

        {/* Requirements list */}
        <RequirementsList requirements={requirements} level={setting.level} />

        {/* Auto-approve status */}
        {autoApprove && (
          <div className="flex items-center gap-2 bg-green-50 rounded px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <p className="text-xs text-green-700">
              KYC will be auto-approved when compliance score reaches 100%
            </p>
          </div>
        )}
        {!autoApprove && (
          <div className="flex items-center gap-2 bg-gray-50 rounded px-3 py-2">
            <XCircle className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <p className="text-xs text-gray-500">
              Manual admin approval required regardless of compliance score
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DueDiligenceSettingsManager({
  settings,
  requirements,
}: DueDiligenceSettingsManagerProps) {
  const settingsByLevel = settings.reduce<Record<string, DueDiligenceSettings>>((acc, s) => {
    acc[s.level] = s;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {LEVEL_ORDER.map((level) => {
        const setting = settingsByLevel[level];
        if (!setting) return null;
        return (
          <LevelCard
            key={level}
            setting={setting}
            requirements={requirements}
          />
        );
      })}
    </div>
  );
}
