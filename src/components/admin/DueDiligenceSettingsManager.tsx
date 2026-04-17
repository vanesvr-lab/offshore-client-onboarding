"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ChevronDown, PlusCircle, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DueDiligenceSettings, DueDiligenceRequirement, DocumentType } from "@/types";

interface DueDiligenceSettingsManagerProps {
  settings: DueDiligenceSettings[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
}

const LEVEL_ORDER = ["sdd", "cdd", "edd"] as const;
const LEVEL_DISPLAY = {
  sdd: { label: "SDD", subtitle: "Simplified Due Diligence", description: "For low-risk clients. Minimal documentation." },
  cdd: { label: "CDD", subtitle: "Standard Customer Due Diligence", description: "Default level. Standard documentation and PEP checks." },
  edd: { label: "EDD", subtitle: "Enhanced Due Diligence", description: "For high-risk clients. Requires senior management approval." },
};

// Cumulative: EDD shows all CDD + SDD reqs too
const CUMULATIVE_LEVELS: Record<string, string[]> = {
  sdd: ["basic", "sdd"],
  cdd: ["basic", "sdd", "cdd"],
  edd: ["basic", "sdd", "cdd", "edd"],
};

const APPLIES_TO_LABELS = {
  individual: "Individual",
  organisation: "Organisation",
  both: "Both",
};

const DOC_CATEGORIES = ["identity", "corporate", "financial", "compliance", "additional"] as const;
const DOC_CAT_LABELS: Record<string, string> = {
  identity: "Identity",
  corporate: "Corporate",
  financial: "Financial",
  compliance: "Compliance",
  additional: "Additional",
};

interface AddReqFormState {
  requirement_type: "document" | "field";
  document_type_id: string;
  field_key: string;
  label: string;
  applies_to: "individual" | "organisation" | "both";
}

const EMPTY_FORM: AddReqFormState = {
  requirement_type: "document",
  document_type_id: "",
  field_key: "",
  label: "",
  applies_to: "both",
};

function AddRequirementForm({
  level,
  documentTypes,
  onAdded,
  onCancel,
}: {
  level: string;
  documentTypes: DocumentType[];
  onAdded: (req: DueDiligenceRequirement) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AddReqFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // When a document type is selected, auto-fill label
  function handleDocTypeChange(docTypeId: string) {
    const dt = documentTypes.find((d) => d.id === docTypeId);
    setForm((p) => ({
      ...p,
      document_type_id: docTypeId,
      label: dt ? dt.name : p.label,
      applies_to: dt
        ? (dt.applies_to as "individual" | "organisation" | "both")
        : p.applies_to,
    }));
  }

  const isValid =
    form.requirement_type === "document"
      ? !!form.document_type_id && !!form.label.trim()
      : !!form.field_key.trim() && !!form.label.trim();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/due-diligence/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          requirement_type: form.requirement_type,
          label: form.label.trim(),
          document_type_id: form.requirement_type === "document" ? form.document_type_id : null,
          field_key: form.requirement_type === "field" ? form.field_key.trim() : null,
          applies_to: form.applies_to,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      // Build the new requirement object for optimistic update
      const dt =
        form.requirement_type === "document"
          ? documentTypes.find((d) => d.id === form.document_type_id)
          : null;
      const newReq: DueDiligenceRequirement = {
        id: data.id!,
        level: level as DueDiligenceRequirement["level"],
        requirement_type: form.requirement_type,
        requirement_key: form.requirement_type === "field" ? form.field_key.trim() : form.document_type_id,
        field_key: form.requirement_type === "field" ? form.field_key.trim() : null,
        label: form.label.trim(),
        description: null,
        document_type_id: form.requirement_type === "document" ? form.document_type_id : null,
        applies_to: form.applies_to,
        sort_order: 999,
        document_types: dt ? { id: dt.id, name: dt.name } : null,
      };
      toast.success("Requirement added");
      onAdded(newReq);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  // Group active document types by category
  const grouped = DOC_CATEGORIES.reduce<Record<string, DocumentType[]>>((acc, cat) => {
    acc[cat] = documentTypes.filter((d) => d.is_active && d.category === cat);
    return acc;
  }, {});

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-gray-50 mt-2">
      <div className="flex items-center gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <div className="flex gap-2">
            {(["document", "field"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm((p) => ({ ...EMPTY_FORM, requirement_type: t, applies_to: p.applies_to }))}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  form.requirement_type === t
                    ? "bg-brand-navy text-white border-brand-navy"
                    : "border-gray-200 text-gray-600 hover:border-gray-400"
                }`}
              >
                {t === "document" ? "Document" : "Field"}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <Label className="text-xs">Applies to</Label>
          <select
            value={form.applies_to}
            onChange={(e) => setForm((p) => ({ ...p, applies_to: e.target.value as typeof form.applies_to }))}
            className="block mt-1 border rounded-lg px-2 py-1.5 text-xs w-full"
          >
            <option value="both">Both</option>
            <option value="individual">Individual</option>
            <option value="organisation">Organisation</option>
          </select>
        </div>
      </div>

      {form.requirement_type === "document" ? (
        <div className="space-y-1">
          <Label className="text-xs">Document type *</Label>
          <select
            value={form.document_type_id}
            onChange={(e) => handleDocTypeChange(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select a document type…</option>
            {DOC_CATEGORIES.map((cat) => {
              const types = grouped[cat];
              if (!types || types.length === 0) return null;
              return (
                <optgroup key={cat} label={DOC_CAT_LABELS[cat]}>
                  {types.map((dt) => (
                    <option key={dt.id} value={dt.id}>
                      {dt.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs">Field key *</Label>
          <Input
            value={form.field_key}
            onChange={(e) => setForm((p) => ({ ...p, field_key: e.target.value }))}
            placeholder="e.g. source_of_wealth"
            className="text-sm"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Label *</Label>
        <Input
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          placeholder="Displayed name for this requirement"
          className="text-sm"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving || !isValid}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Add
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function RequirementsList({
  allRequirements,
  level,
  documentTypes,
  onAdded,
  onRemoved,
}: {
  allRequirements: DueDiligenceRequirement[];
  level: string;
  documentTypes: DocumentType[];
  onAdded: (req: DueDiligenceRequirement) => void;
  onRemoved: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const cumulativeLevels = CUMULATIVE_LEVELS[level] ?? [level];
  const cumulativeReqs = allRequirements.filter((r) => cumulativeLevels.includes(r.level));
  // Own-level reqs (not inherited)
  const ownReqs = allRequirements.filter((r) => r.level === level);
  const inheritedCount = cumulativeReqs.length - ownReqs.length;

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/admin/due-diligence/requirements/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Requirement removed");
      onRemoved(id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Hide" : "View"} requirements ({ownReqs.length} own
          {inheritedCount > 0 ? ` + ${inheritedCount} inherited` : ""})
        </button>
        <button
          onClick={() => { setExpanded(true); setShowAdd(true); }}
          className="flex items-center gap-1 text-xs text-brand-navy hover:text-brand-blue"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {/* Inherited requirements (read-only) */}
          {inheritedCount > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Inherited</p>
              {cumulativeReqs
                .filter((r) => r.level !== level)
                .map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-50 opacity-70">
                    <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                    <span className="text-xs text-gray-500 flex-1 truncate">{r.label}</span>
                    <span className="text-[10px] text-gray-400 uppercase">{r.level}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-500">
                      {APPLIES_TO_LABELS[r.applies_to] ?? r.applies_to}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Own requirements (editable) */}
          <div className="space-y-0.5">
            {inheritedCount > 0 && (
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                {level.toUpperCase()}-specific
              </p>
            )}
            {ownReqs.length === 0 && !showAdd && (
              <p className="text-xs text-gray-400 py-1">No requirements specific to this level yet.</p>
            )}
            {ownReqs.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 px-2 py-1 rounded border bg-white">
                <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                <span className="text-xs text-gray-700 flex-1 truncate">{r.label}</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-500">
                  {APPLIES_TO_LABELS[r.applies_to] ?? r.applies_to}
                </span>
                <button
                  onClick={() => void handleRemove(r.id)}
                  disabled={removingId === r.id}
                  className="text-gray-300 hover:text-red-400 transition-colors ml-1"
                  title="Remove"
                >
                  {removingId === r.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <X className="h-3 w-3" />}
                </button>
              </div>
            ))}
          </div>

          {showAdd ? (
            <AddRequirementForm
              level={level}
              documentTypes={documentTypes}
              onAdded={(req) => { onAdded(req); setShowAdd(false); }}
              onCancel={() => setShowAdd(false)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function LevelCard({
  setting,
  requirements,
  documentTypes,
  onRequirementAdded,
  onRequirementRemoved,
}: {
  setting: DueDiligenceSettings;
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  onRequirementAdded: (req: DueDiligenceRequirement) => void;
  onRequirementRemoved: (id: string) => void;
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

        {/* Requirements list with CRUD */}
        <div className="border-t pt-3">
          <RequirementsList
            allRequirements={requirements}
            level={setting.level}
            documentTypes={documentTypes}
            onAdded={onRequirementAdded}
            onRemoved={onRequirementRemoved}
          />
        </div>

        {/* Auto-approve status */}
        {autoApprove ? (
          <div className="flex items-center gap-2 bg-green-50 rounded px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <p className="text-xs text-green-700">
              KYC will be auto-approved when compliance score reaches 100%
            </p>
          </div>
        ) : (
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
  requirements: initialRequirements,
  documentTypes,
}: DueDiligenceSettingsManagerProps) {
  const [requirements, setRequirements] = useState(initialRequirements);

  const settingsByLevel = settings.reduce<Record<string, DueDiligenceSettings>>((acc, s) => {
    acc[s.level] = s;
    return acc;
  }, {});

  function handleAdded(req: DueDiligenceRequirement) {
    setRequirements((prev) => [...prev, req]);
  }

  function handleRemoved(id: string) {
    setRequirements((prev) => prev.filter((r) => r.id !== id));
  }

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
            documentTypes={documentTypes}
            onRequirementAdded={handleAdded}
            onRequirementRemoved={handleRemoved}
          />
        );
      })}
    </div>
  );
}
