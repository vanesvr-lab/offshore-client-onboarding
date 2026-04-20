"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { KYC_PREFILLABLE_FIELDS } from "@/lib/constants/prefillFields";
import { cn } from "@/lib/utils";
import type { AiExtractionField } from "@/types";

interface DocumentTypeRow {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  verification_rules_text: string | null;
  ai_enabled: boolean | null;
  ai_extraction_enabled: boolean | null;
  ai_extraction_fields: AiExtractionField[] | null;
}

const CATEGORY_ORDER = ["identity", "corporate", "financial", "compliance", "additional"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  identity: "Identity",
  corporate: "Corporate",
  financial: "Financial",
  compliance: "Compliance",
  additional: "Additional",
};

const NONE_VALUE = "__none__";

function makeBlankField(): AiExtractionField {
  return { key: "", label: "", ai_hint: "", type: "string", prefill_field: null };
}

function DocumentTypeCard({ docType }: { docType: DocumentTypeRow }) {
  const [aiEnabled, setAiEnabled] = useState<boolean>(docType.ai_enabled ?? true);
  const [extractionEnabled, setExtractionEnabled] = useState<boolean>(docType.ai_extraction_enabled ?? false);
  const [fields, setFields] = useState<AiExtractionField[]>(
    Array.isArray(docType.ai_extraction_fields) ? [...docType.ai_extraction_fields] : []
  );
  const [rulesText, setRulesText] = useState<string>(docType.verification_rules_text ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function updateField(idx: number, patch: Partial<AiExtractionField>) {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function addField() {
    setFields((prev) => [...prev, makeBlankField()]);
    setDirty(true);
  }

  function removeField(idx: number) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  async function handleSave() {
    // Quick client-side validation: keys unique + non-empty when extraction enabled
    if (extractionEnabled) {
      const seen = new Set<string>();
      for (const f of fields) {
        if (!f.key.trim() || !f.label.trim()) {
          toast.error("Every field needs a key and a label");
          return;
        }
        if (seen.has(f.key.trim())) {
          toast.error(`Duplicate field key "${f.key}"`);
          return;
        }
        seen.add(f.key.trim());
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/document-types/${docType.id}/rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_enabled: aiEnabled,
          ai_extraction_enabled: aiEnabled ? extractionEnabled : false,
          ai_extraction_fields: aiEnabled && extractionEnabled
            ? fields.map((f) => ({
                key: f.key.trim(),
                label: f.label.trim(),
                ai_hint: f.ai_hint?.trim() || undefined,
                type: f.type,
                prefill_field: f.prefill_field || null,
              }))
            : [],
          verification_rules_text: rulesText.trim() ? rulesText : null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      setDirty(false);
      toast.success(`Saved "${docType.name}"`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const greyed = !aiEnabled;

  return (
    <div className="rounded-lg border bg-white p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-brand-navy">{docType.name}</h3>
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">{docType.category}</p>
        </div>
      </div>

      {/* Toggle: Enable AI */}
      <div className="flex items-start gap-2.5">
        <Switch
          checked={aiEnabled}
          onCheckedChange={(v) => {
            markDirty(setAiEnabled)(v);
          }}
        />
        <div className="text-xs leading-tight">
          <p className="font-medium text-gray-800">Enable AI on this document</p>
          <p className="text-gray-500">
            Uncheck to skip the AI call. Uploads will land at <em>pending admin review</em> directly.
          </p>
        </div>
      </div>

      {/* Toggle: Extract fields */}
      <div className={cn("flex items-start gap-2.5", greyed && "opacity-50 pointer-events-none")}>
        <Switch
          checked={aiEnabled && extractionEnabled}
          onCheckedChange={(v) => markDirty(setExtractionEnabled)(v)}
          disabled={greyed}
        />
        <div className="text-xs leading-tight">
          <p className="font-medium text-gray-800">Extract fields from this document</p>
          <p className="text-gray-500">When on, the AI reads the document and returns structured data.</p>
        </div>
      </div>

      {/* Fields editor */}
      {aiEnabled && extractionEnabled && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Fields to extract</p>
          {fields.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No fields yet — click <em>Add field</em> below.</p>
          ) : (
            <div className="rounded border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Key</th>
                    <th className="px-2 py-1.5 text-left font-medium">Label</th>
                    <th className="px-2 py-1.5 text-left font-medium">Type</th>
                    <th className="px-2 py-1.5 text-left font-medium">Prefill to</th>
                    <th className="px-2 py-1.5 text-left font-medium">AI hint</th>
                    <th className="px-2 py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, idx) => (
                    <tr key={idx} className="border-t border-gray-100 align-top">
                      <td className="px-2 py-1.5 w-[20%]">
                        <Input
                          value={f.key}
                          onChange={(e) => updateField(idx, { key: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="passport_number"
                        />
                      </td>
                      <td className="px-2 py-1.5 w-[22%]">
                        <Input
                          value={f.label}
                          onChange={(e) => updateField(idx, { label: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="Passport number"
                        />
                      </td>
                      <td className="px-2 py-1.5 w-[12%]">
                        <Select
                          value={f.type}
                          onValueChange={(v) => updateField(idx, { type: (v as "string" | "date") ?? "string" })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="string">string</SelectItem>
                            <SelectItem value="date">date</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5 w-[22%]">
                        <Select
                          value={f.prefill_field ?? NONE_VALUE}
                          onValueChange={(v) =>
                            updateField(idx, { prefill_field: v === NONE_VALUE ? null : v })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="— none —" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>— none —</SelectItem>
                            {KYC_PREFILLABLE_FIELDS.map((k) => (
                              <SelectItem key={k} value={k}>
                                {k}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={f.ai_hint ?? ""}
                          onChange={(e) => updateField(idx, { ai_hint: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="MRZ or printed number"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeField(idx)}
                          className="text-gray-400 hover:text-red-500"
                          title="Remove field"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            type="button"
            onClick={addField}
            className="inline-flex items-center gap-1 text-xs text-brand-blue hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add field
          </button>
        </div>
      )}

      {/* Verification rules textarea */}
      <div className={cn("space-y-1.5", greyed && "opacity-50 pointer-events-none")}>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Verification rules</p>
        <Textarea
          value={rulesText}
          onChange={(e) => {
            setRulesText(e.target.value);
            setDirty(true);
          }}
          rows={4}
          placeholder={"e.g.\n1. Document must not be expired\n2. Name must match applicant"}
          className="text-xs resize-y"
          spellCheck={false}
          disabled={greyed}
        />
        <p className="text-[10px] text-gray-400">
          Number each rule on its own line. The AI will evaluate each one against the document.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          className="bg-brand-navy hover:bg-brand-blue gap-1.5"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  docTypes,
}: {
  category: string;
  docTypes: DocumentTypeRow[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          {CATEGORY_LABELS[category] ?? category}
        </span>
        <span className="text-xs text-gray-400">({docTypes.length})</span>
      </button>

      {open && (
        <div className="space-y-4">
          {docTypes.map((dt) => (
            <DocumentTypeCard key={dt.id} docType={dt} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function VerificationRulesPage() {
  const [docTypes, setDocTypes] = useState<DocumentTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    void loadTypes();
  }, []);

  async function loadTypes() {
    setLoading(true);
    try {
      const r = await fetch("/api/document-types");
      const d = (await r.json()) as { documentTypes?: DocumentTypeRow[] };
      setDocTypes((d.documentTypes ?? []).filter((dt) => dt.is_active));
    } catch {
      toast.error("Failed to load document types");
    } finally {
      setLoading(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const r = await fetch("/api/admin/migrations/seed-ai-defaults", { method: "POST" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Seed failed");
      toast.success("Defaults seeded");
      await loadTypes();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  const grouped: Record<string, DocumentTypeRow[]> = {};
  for (const dt of docTypes) {
    if (!grouped[dt.category]) grouped[dt.category] = [];
    grouped[dt.category].push(dt);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">AI Document Rules</h1>
          <p className="text-gray-500 text-sm mt-1">
            Per-document type: enable AI verification, define which fields to extract (and where they prefill on the KYC form), and write plain-English numbered rules.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleSeed()}
          disabled={seeding}
          className="text-xs"
        >
          {seeding ? "Seeding…" : "Seed defaults"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading document types…</p>
      ) : docTypes.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No active document types found.</p>
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
            <CategorySection key={category} category={category} docTypes={grouped[category]} />
          ))}
          {Object.keys(grouped)
            .filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c))
            .map((category) => (
              <CategorySection key={category} category={category} docTypes={grouped[category]} />
            ))}
        </div>
      )}
    </div>
  );
}
