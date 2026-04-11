"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface DocumentTypeWithRules {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  verification_rules_text: string | null;
}

const CATEGORY_ORDER = ["identity", "corporate", "financial", "compliance", "additional"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  identity: "Identity",
  corporate: "Corporate",
  financial: "Financial",
  compliance: "Compliance",
  additional: "Additional",
};

function DocumentTypeCard({
  docType,
}: {
  docType: DocumentTypeWithRules;
}) {
  const [text, setText] = useState(docType.verification_rules_text ?? "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  function handleChange(val: string) {
    setText(val);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/document-types/${docType.id}/rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationRulesText: text }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }
      setDirty(false);
      toast.success(`Rules saved for "${docType.name}"`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <h3 className="text-sm font-semibold text-brand-navy">{docType.name}</h3>
      <Textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={5}
        placeholder={`e.g.\n1. Document must not be expired\n2. Name on document must match client name\n3. Document must be a certified copy`}
        className="text-sm resize-y"
        spellCheck={false}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Number each rule on its own line. The AI will evaluate each one against the document.
        </p>
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
  docTypes: DocumentTypeWithRules[];
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
  const [docTypes, setDocTypes] = useState<DocumentTypeWithRules[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/document-types")
      .then((r) => r.json())
      .then((d: { documentTypes?: DocumentTypeWithRules[] }) => {
        setDocTypes((d.documentTypes ?? []).filter((dt) => dt.is_active));
      })
      .catch(() => toast.error("Failed to load document types"))
      .finally(() => setLoading(false));
  }, []);

  const grouped: Record<string, DocumentTypeWithRules[]> = {};
  for (const dt of docTypes) {
    if (!grouped[dt.category]) grouped[dt.category] = [];
    grouped[dt.category].push(dt);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Verification Rules</h1>
        <p className="text-gray-500 text-sm mt-1">
          Write plain English rules for each document type. The AI will evaluate each numbered rule against the uploaded document.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading document types…</p>
      ) : docTypes.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No active document types found.</p>
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
            <CategorySection
              key={category}
              category={category}
              docTypes={grouped[category]}
            />
          ))}
          {/* Any categories not in the fixed order */}
          {Object.keys(grouped)
            .filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c))
            .map((category) => (
              <CategorySection
                key={category}
                category={category}
                docTypes={grouped[category]}
              />
            ))}
        </div>
      )}
    </div>
  );
}
