"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PlusCircle, X, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import type { RoleDocumentRequirement, DocumentType } from "@/types";

type Role = "primary_client" | "director" | "shareholder" | "ubo";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "primary_client", label: "Primary Client", description: "The main signatory / account holder" },
  { value: "director", label: "Director", description: "Company director or authorised officer" },
  { value: "shareholder", label: "Shareholder", description: "Individual or corporate shareholder" },
  { value: "ubo", label: "UBO", description: "Ultimate beneficial owner (25%+ stake)" },
];

const DOC_CATEGORIES = ["identity", "corporate", "financial", "compliance", "additional"] as const;
const DOC_CAT_LABELS: Record<string, string> = {
  identity: "Identity",
  corporate: "Corporate",
  financial: "Financial",
  compliance: "Compliance",
  additional: "Additional",
};

interface Props {
  requirements: RoleDocumentRequirement[];
  documentTypes: DocumentType[];
}

function AddDocumentForm({
  role,
  existingDocTypeIds,
  documentTypes,
  onAdded,
  onCancel,
}: {
  role: Role;
  existingDocTypeIds: Set<string>;
  documentTypes: DocumentType[];
  onAdded: (req: RoleDocumentRequirement) => void;
  onCancel: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);

  const available = documentTypes.filter((d) => !existingDocTypeIds.has(d.id));
  const grouped = DOC_CATEGORIES.reduce<Record<string, DocumentType[]>>((acc, cat) => {
    acc[cat] = available.filter((d) => d.category === cat);
    return acc;
  }, {});

  async function handleAdd() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/role-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, document_type_id: selectedId }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const dt = documentTypes.find((d) => d.id === selectedId)!;
      const newReq: RoleDocumentRequirement = {
        id: data.id!,
        role,
        document_type_id: selectedId,
        is_required: true,
        sort_order: 999,
        document_types: { id: dt.id, name: dt.name },
      };
      toast.success("Requirement added");
      onAdded(newReq);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-xl p-3 space-y-3 bg-gray-50 mt-2">
      <div className="space-y-1">
        <Label className="text-xs">Document type *</Label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
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
                    {dt.applies_to !== "both" ? ` (${dt.applies_to})` : ""}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void handleAdd()}
          disabled={saving || !selectedId}
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

function RoleCard({
  role,
  label,
  description,
  requirements,
  documentTypes,
  onAdded,
  onRemoved,
}: {
  role: Role;
  label: string;
  description: string;
  requirements: RoleDocumentRequirement[];
  documentTypes: DocumentType[];
  onAdded: (req: RoleDocumentRequirement) => void;
  onRemoved: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const existingIds = new Set(requirements.map((r) => r.document_type_id));

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/admin/role-requirements/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Removed");
      onRemoved(id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors rounded-t-lg"
      >
        <div>
          <CardTitle className="text-sm text-brand-navy">{label}</CardTitle>
          <p className="text-xs text-gray-400">{description} · {requirements.length} document{requirements.length !== 1 ? "s" : ""} required</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <CardContent className="pt-0 pb-4 space-y-2">
          {requirements.length === 0 && !showAdd && (
            <p className="text-sm text-gray-400 py-2">No requirements configured for this role.</p>
          )}
          {requirements.map((req) => (
            <div key={req.id} className="flex items-center justify-between px-3 py-2 rounded-lg border bg-white">
              <span className="text-sm text-gray-700">{req.document_types?.name ?? req.document_type_id}</span>
              <button
                onClick={() => void handleRemove(req.id)}
                disabled={removingId === req.id}
                className="text-gray-300 hover:text-red-400 transition-colors ml-2"
                title="Remove"
              >
                {removingId === req.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <X className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}

          {showAdd ? (
            <AddDocumentForm
              role={role}
              existingDocTypeIds={existingIds}
              documentTypes={documentTypes}
              onAdded={(req) => { onAdded(req); setShowAdd(false); }}
              onCancel={() => setShowAdd(false)}
            />
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-xs text-brand-navy hover:text-brand-blue mt-1"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Add document type
            </button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function RoleRequirementsManager({ requirements: initial, documentTypes }: Props) {
  const [requirements, setRequirements] = useState(initial);

  const byRole = ROLES.reduce<Record<Role, RoleDocumentRequirement[]>>((acc, { value }) => {
    acc[value] = requirements.filter((r) => r.role === value);
    return acc;
  }, {} as Record<Role, RoleDocumentRequirement[]>);

  return (
    <div className="space-y-4">
      {ROLES.map(({ value, label, description }) => (
        <RoleCard
          key={value}
          role={value}
          label={label}
          description={description}
          requirements={byRole[value]}
          documentTypes={documentTypes}
          onAdded={(req) => setRequirements((prev) => [...prev, req])}
          onRemoved={(id) => setRequirements((prev) => prev.filter((r) => r.id !== id))}
        />
      ))}
    </div>
  );
}
