"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FilePlus } from "lucide-react";
import { toast } from "sonner";

interface ServiceTemplate {
  id: string;
  name: string;
}

interface AddBlankApplicationProps {
  clientId: string;
  templates: ServiceTemplate[];
}

/**
 * "Add Application" — creates a blank draft application for a client.
 * Admin just picks the service type. No validation, no wizard.
 * The client (or admin) fills in the details later.
 */
export function AddBlankApplication({ clientId, templates }: AddBlankApplicationProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!templateId) {
      toast.error("Select a service type");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/applications/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          clientId,
          business_name: "",
          business_type: "",
          business_country: "",
          business_address: "",
          contact_name: "",
          contact_email: "",
          contact_phone: "",
          ubo_data: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create application");

      toast.success("Blank application created");
      setOpen(false);
      setTemplateId("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <FilePlus className="h-3.5 w-3.5" />
        Add application
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (o) setOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add blank application</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            Create a blank application for the client to fill out later.
            Just select the service type — no other details needed now.
          </p>
          <div className="space-y-1.5">
            <Label className="text-sm">Service type *</Label>
            <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select service type…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={create}
              disabled={saving || !templateId}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
