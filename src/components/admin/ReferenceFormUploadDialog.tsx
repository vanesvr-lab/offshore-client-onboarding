"use client";

// B-120 — Upload dialog used for both "Upload new reference form" and the
// per-row "Replace with new version" flow. In replace mode, template +
// action_key + name are pre-filled and locked; the server route deactivates
// the previous row and links replaced_by_id forward.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface TemplateActionBinding {
  service_template_id: string;
  template_name: string;
  action_key: string;
  action_label: string;
}

export interface ReplaceTarget {
  id: string;
  name: string;
  service_template_id: string;
  action_key: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bindings: TemplateActionBinding[];
  replaceTarget?: ReplaceTarget | null;
}

export function ReferenceFormUploadDialog({
  open,
  onOpenChange,
  bindings,
  replaceTarget,
}: Props) {
  const router = useRouter();
  const isReplace = Boolean(replaceTarget);

  const [name, setName] = useState(replaceTarget?.name ?? "");
  const [serviceTemplateId, setServiceTemplateId] = useState(
    replaceTarget?.service_template_id ?? bindings[0]?.service_template_id ?? "",
  );
  const [actionKey, setActionKey] = useState(replaceTarget?.action_key ?? "");
  const [versionLabel, setVersionLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset state when the dialog opens with a different target.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(replaceTarget?.name ?? "");
      setServiceTemplateId(
        replaceTarget?.service_template_id ?? bindings[0]?.service_template_id ?? "",
      );
      setActionKey(replaceTarget?.action_key ?? "");
      setVersionLabel("");
      setSourceUrl("");
      setFile(null);
    }
    onOpenChange(next);
  }

  // For new uploads, action_key options depend on the selected template.
  const actionsForTemplate = bindings.filter(
    (b) => b.service_template_id === serviceTemplateId,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Pick a file to upload");
      return;
    }
    if (!isReplace) {
      if (!name.trim()) return toast.error("Form name is required");
      if (!serviceTemplateId) return toast.error("Pick a service template");
      if (!actionKey) return toast.error("Pick an Action subsection");
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());
    formData.append("service_template_id", serviceTemplateId);
    formData.append("action_key", actionKey);
    if (versionLabel.trim()) formData.append("version_label", versionLabel.trim());
    if (sourceUrl.trim()) formData.append("source_url", sourceUrl.trim());
    if (replaceTarget) formData.append("replace_for_form_id", replaceTarget.id);

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/reference-forms", {
        method: "POST",
        body: formData,
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Upload failed");
        return;
      }
      toast.success(isReplace ? "New version uploaded" : "Reference form added");
      handleOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isReplace ? "Replace with new version" : "Upload new reference form"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Form name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. FSC Form A"
              disabled={isReplace}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Service template *</Label>
              <select
                value={serviceTemplateId}
                onChange={(e) => {
                  setServiceTemplateId(e.target.value);
                  setActionKey("");
                }}
                disabled={isReplace}
                className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              >
                {Array.from(
                  new Map(
                    bindings.map((b) => [b.service_template_id, b.template_name]),
                  ).entries(),
                ).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action subsection *</Label>
              <select
                value={actionKey}
                onChange={(e) => setActionKey(e.target.value)}
                disabled={isReplace}
                className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="">— Pick one —</option>
                {actionsForTemplate.map((b) => (
                  <option key={b.action_key} value={b.action_key}>
                    {b.action_label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Version label</Label>
              <Input
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                placeholder="e.g. v2025-01"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source URL</Label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">File *</Label>
            <Input
              type="file"
              accept=".pdf,.doc,.docx,image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-gray-500">
              PDF, DOC/DOCX, JPEG, or PNG. Max 25 MB.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1.5" />
              )}
              {isReplace ? "Upload new version" : "Upload form"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
