"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { DocumentRequirement } from "@/types";

export default function VerificationRulesPage() {
  const supabase = createClient();
  const [requirements, setRequirements] = useState<
    (DocumentRequirement & { service_templates?: { name: string } })[]
  >([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [jsonValue, setJsonValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("document_requirements")
      .select("*, service_templates(name)")
      .order("template_id")
      .then(({ data }) => setRequirements(data || []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectRequirement(
    req: DocumentRequirement & { service_templates?: { name: string } }
  ) {
    setSelected(req.id);
    setJsonValue(JSON.stringify(req.verification_rules || {}, null, 2));
    setJsonError(null);
  }

  function handleJsonChange(value: string) {
    setJsonValue(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }

  async function saveRules() {
    if (!selected || jsonError) return;
    setSaving(true);
    try {
      const parsed = JSON.parse(jsonValue);
      const { error } = await supabase
        .from("document_requirements")
        .update({ verification_rules: parsed })
        .eq("id", selected);
      if (error) throw error;
      toast.success("Verification rules saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const selectedReq = requirements.find((r) => r.id === selected);

  // Group by template
  const byTemplate = requirements.reduce<
    Record<string, (DocumentRequirement & { service_templates?: { name: string } })[]>
  >((acc, req) => {
    const templateName = req.service_templates?.name || "Unknown";
    if (!acc[templateName]) acc[templateName] = [];
    acc[templateName].push(req);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">
          Verification Rules
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Edit AI verification rules per document type (JSON editor)
        </p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        {/* Document list */}
        <div className="space-y-4 overflow-y-auto max-h-[70vh]">
          {Object.entries(byTemplate).map(([templateName, reqs]) => (
            <div key={templateName}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">
                {templateName}
              </p>
              <div className="space-y-1">
                {reqs.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => selectRequirement(req)}
                    className={`w-full text-left rounded-lg border p-2.5 text-sm transition-colors ${
                      selected === req.id
                        ? "border-brand-navy bg-brand-navy/5"
                        : "hover:bg-gray-50 bg-white"
                    }`}
                  >
                    <p className="font-medium text-brand-navy truncate">
                      {req.name}
                    </p>
                    <p className="text-xs text-gray-400 capitalize">
                      {req.category}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* JSON editor */}
        <div className="col-span-2">
          {selectedReq ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-brand-navy text-base">
                  {selectedReq.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={jsonValue}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  rows={24}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
                {jsonError && (
                  <p className="text-xs text-red-500">
                    JSON error: {jsonError}
                  </p>
                )}
                <Button
                  onClick={saveRules}
                  disabled={saving || !!jsonError}
                  className="bg-brand-navy hover:bg-brand-blue"
                >
                  {saving ? "Saving…" : "Save Rules"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm border-2 border-dashed rounded-lg">
              Select a document to edit its verification rules
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
