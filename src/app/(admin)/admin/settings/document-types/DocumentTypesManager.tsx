"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusCircle, Pencil, CheckCircle, XCircle, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import type { DocumentType, DocumentScope } from "@/types";

interface Props {
  documentTypes: DocumentType[];
}

const CATEGORIES = [
  { value: "identity", label: "Identity" },
  { value: "corporate", label: "Corporate" },
  { value: "financial", label: "Financial" },
  { value: "compliance", label: "Compliance" },
  { value: "additional", label: "Additional" },
] as const;

const APPLIES_TO = [
  { value: "individual", label: "Individual" },
  { value: "organisation", label: "Organisation" },
  { value: "both", label: "Both" },
] as const;

const SCOPE_OPTIONS = [
  { value: "person", label: "Person KYC" },
  { value: "application", label: "Service-level" },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

const EMPTY_FORM = {
  name: "",
  category: "identity" as CategoryValue,
  applies_to: "both" as "individual" | "organisation" | "both",
  scope: "person" as DocumentScope,
  description: "",
};

function DocumentTypeForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: typeof EMPTY_FORM;
  onSave: (form: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Name *</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Certified Passport Copy"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Category *</Label>
          <select
            value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as CategoryValue }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Applies to</Label>
          <select
            value={form.applies_to}
            onChange={(e) => setForm((p) => ({ ...p, applies_to: e.target.value as typeof form.applies_to }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {APPLIES_TO.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Scope</Label>
          <select
            value={form.scope}
            onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value as DocumentScope }))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <p className="text-[11px] text-gray-500 leading-snug">
            <span className="font-medium">Person KYC</span>: uploaded per Director / Shareholder / UBO inside the per-person KYC wizard.
            {" "}<span className="font-medium">Service-level</span>: uploaded once per application in the Documents step.
          </p>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Description</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Optional description"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={saving || !form.name.trim()}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function DocTypeRow({
  dt,
  onToggleActive,
  onEdit,
}: {
  dt: DocumentType;
  onToggleActive: (id: string, active: boolean) => void;
  onEdit: (dt: DocumentType) => void;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${dt.is_active ? "bg-white" : "bg-gray-50 opacity-60"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{dt.name}</p>
          <span className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{dt.applies_to}</span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              (dt.scope ?? "person") === "application"
                ? "bg-blue-50 text-blue-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {(dt.scope ?? "person") === "application" ? "Service" : "KYC"}
          </span>
        </div>
        {dt.description && <p className="text-xs text-gray-400 truncate">{dt.description}</p>}
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        <button
          onClick={() => onToggleActive(dt.id, !dt.is_active)}
          className={`text-xs flex items-center gap-1 ${dt.is_active ? "text-green-600" : "text-gray-400"}`}
          title={dt.is_active ? "Deactivate" : "Activate"}
        >
          {dt.is_active ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onEdit(dt)}
          className="text-gray-400 hover:text-brand-navy transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function DocumentTypesManager({ documentTypes: initial }: Props) {
  const router = useRouter();
  const [docTypes, setDocTypes] = useState(initial);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORIES.map((c) => c.value)));

  const grouped = docTypes.reduce<Record<string, DocumentType[]>>((acc, dt) => {
    const cat = dt.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(dt);
    return acc;
  }, {});

  function toggleCat(cat: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  async function handleCreate(form: typeof EMPTY_FORM) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/document-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Document type created");
      setShowAddForm(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, form: typeof EMPTY_FORM) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/document-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Updated");
      setEditingId(null);
      setDocTypes((prev) => prev.map((dt) => dt.id === id ? { ...dt, ...form } : dt));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    try {
      const res = await fetch(`/api/admin/document-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: active }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDocTypes((prev) => prev.map((dt) => dt.id === id ? { ...dt, is_active: active } : dt));
      toast.success(active ? "Activated" : "Deactivated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setShowAddForm(true)}
          className="bg-brand-navy hover:bg-brand-blue gap-1.5"
        >
          <PlusCircle className="h-4 w-4" />
          Add document type
        </Button>
      </div>

      {showAddForm && (
        <DocumentTypeForm
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onCancel={() => setShowAddForm(false)}
          saving={saving}
        />
      )}

      {CATEGORIES.map(({ value: cat, label }) => {
        const types = grouped[cat] ?? [];
        const expanded = expandedCats.has(cat);
        const activeCount = types.filter((t) => t.is_active).length;
        return (
          <Card key={cat}>
            <button
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
            >
              <div>
                <CardTitle className="text-sm text-brand-navy">{label}</CardTitle>
                <p className="text-xs text-gray-400">{activeCount}/{types.length} active</p>
              </div>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && (
              <CardContent className="pt-0 pb-4 space-y-2">
                {types.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No document types in this category yet.</p>
                ) : (
                  types.map((dt) =>
                    editingId === dt.id ? (
                      <DocumentTypeForm
                        key={dt.id}
                        initial={{
                          name: dt.name,
                          category: dt.category as CategoryValue,
                          applies_to: dt.applies_to as "individual" | "organisation" | "both",
                          scope: (dt.scope ?? "person") as DocumentScope,
                          description: dt.description ?? "",
                        }}
                        onSave={(form) => void handleUpdate(dt.id, form)}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    ) : (
                      <DocTypeRow
                        key={dt.id}
                        dt={dt}
                        onToggleActive={(id, active) => void handleToggleActive(id, active)}
                        onEdit={(d) => setEditingId(d.id)}
                      />
                    )
                  )
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
