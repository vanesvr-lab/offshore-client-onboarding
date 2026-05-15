"use client";

// B-120 — Settings page client. Lists all reference forms with filters,
// hosts the Upload / Replace dialog, and exposes per-row Deactivate /
// Reactivate actions.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Plus, RotateCcw, XCircle, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ReferenceFormUploadDialog,
  type ReplaceTarget,
  type TemplateActionBinding,
} from "@/components/admin/ReferenceFormUploadDialog";
import type { ReferenceFormRow } from "./page";

interface Props {
  forms: ReferenceFormRow[];
  bindings: TemplateActionBinding[];
  templateNameById: Record<string, string>;
}

export function ReferenceFormsManager({ forms, bindings, templateNameById }: Props) {
  const router = useRouter();
  const [filterTemplate, setFilterTemplate] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(null);

  const actionLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bindings) m.set(b.action_key, b.action_label);
    return m;
  }, [bindings]);

  // Action options for the template filter: distinct action_keys across the
  // filtered set (or across everything if no template is picked).
  const actionOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const b of bindings) {
      if (!filterTemplate || b.service_template_id === filterTemplate) {
        keys.add(b.action_key);
      }
    }
    return Array.from(keys);
  }, [bindings, filterTemplate]);

  const filtered = useMemo(() => {
    return forms.filter((f) => {
      if (filterTemplate && f.service_template_id !== filterTemplate) return false;
      if (filterAction && f.action_key !== filterAction) return false;
      if (!includeDeactivated && f.status !== "active") return false;
      return true;
    });
  }, [forms, filterTemplate, filterAction, includeDeactivated]);

  async function onDeactivate(form: ReferenceFormRow) {
    const note = window.prompt(
      "Optional note explaining why this form is being deactivated (leave blank to skip):",
      "",
    );
    if (note === null) return; // user cancelled

    setBusyId(form.id);
    try {
      const res = await fetch(`/api/admin/reference-forms/${form.id}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Failed to deactivate");
        return;
      }
      toast.success("Form deactivated");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onReactivate(form: ReferenceFormRow) {
    setBusyId(form.id);
    try {
      const res = await fetch(`/api/admin/reference-forms/${form.id}/reactivate`, {
        method: "POST",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Failed to reactivate");
        return;
      }
      toast.success("Form reactivated");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function onDownloadBlank(form: ReferenceFormRow) {
    setBusyId(form.id);
    try {
      const res = await fetch(`/api/admin/reference-forms/${form.id}/blank-download-url`);
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Could not generate download URL");
        return;
      }
      window.open(body.url, "_blank");
    } finally {
      setBusyId(null);
    }
  }

  function openReplaceDialog(form: ReferenceFormRow) {
    setReplaceTarget({
      id: form.id,
      name: form.name,
      service_template_id: form.service_template_id,
      action_key: form.action_key,
    });
    setUploadOpen(true);
  }

  function openNewUploadDialog() {
    setReplaceTarget(null);
    setUploadOpen(true);
  }

  const templates = Array.from(
    new Map(bindings.map((b) => [b.service_template_id, b.template_name])).entries(),
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3 bg-white border rounded-xl p-3">
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Template</label>
          <select
            value={filterTemplate}
            onChange={(e) => {
              setFilterTemplate(e.target.value);
              setFilterAction(""); // reset action when template changes
            }}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="">All templates</option>
            {templates.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-500">Action</label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-[200px]"
          >
            <option value="">All actions</option>
            {actionOptions.map((key) => (
              <option key={key} value={key}>
                {actionLabelByKey.get(key) ?? key}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm self-center">
          <input
            type="checkbox"
            checked={includeDeactivated}
            onChange={(e) => setIncludeDeactivated(e.target.checked)}
          />
          Include deactivated
        </label>
        <div className="ml-auto">
          <Button onClick={openNewUploadDialog}>
            <Plus className="h-4 w-4 mr-1.5" />
            Upload new reference form
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">Template</th>
              <th className="text-left px-3 py-2 font-semibold">Action</th>
              <th className="text-left px-3 py-2 font-semibold">Name</th>
              <th className="text-left px-3 py-2 font-semibold">Version</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">Source</th>
              <th className="text-right px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  No reference forms match the current filters.
                </td>
              </tr>
            )}
            {filtered.map((f) => {
              const isActive = f.status === "active";
              const canReactivate = !isActive && !f.replaced_by_id;
              const isReplaced =
                !isActive && f.deactivated_reason === "replaced_by_newer_version";
              return (
                <tr key={f.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2">
                    {templateNameById[f.service_template_id] ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {actionLabelByKey.get(f.action_key) ?? f.action_key}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">{f.name}</td>
                  <td className="px-3 py-2 text-gray-600">{f.version_label ?? "—"}</td>
                  <td className="px-3 py-2">
                    {isActive ? (
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {isReplaced ? (
                          <>
                            <History className="h-3 w-3 mr-1" /> Replaced
                          </>
                        ) : (
                          "Deactivated"
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 truncate max-w-[200px]">
                    {f.source_url ? (
                      <a
                        href={f.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-navy underline hover:no-underline"
                      >
                        Link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDownloadBlank(f)}
                        disabled={busyId === f.id}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </Button>
                      {isActive && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReplaceDialog(f)}
                            disabled={busyId === f.id}
                          >
                            Replace
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDeactivate(f)}
                            disabled={busyId === f.id}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Deactivate
                          </Button>
                        </>
                      )}
                      {canReactivate && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onReactivate(f)}
                          disabled={busyId === f.id}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReferenceFormUploadDialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) setReplaceTarget(null);
        }}
        bindings={bindings}
        replaceTarget={replaceTarget}
      />
    </div>
  );
}
