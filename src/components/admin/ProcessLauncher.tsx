"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Template {
  id: string;
  name: string;
  description: string | null;
  client_type: string | null;
}

interface ProcessLauncherProps {
  clientId: string;
  clientType: "individual" | "organisation" | null;
}

export function ProcessLauncher({ clientId, clientType }: ProcessLauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [notes, setNotes] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const qs = clientType ? `?clientType=${clientType}` : "";
    fetch(`/api/admin/processes/templates${qs}`)
      .then((r) => r.json())
      .then((d: { templates?: Template[] }) => setTemplates(d.templates ?? []))
      .catch(() => toast.error("Failed to load process templates"));
  }, [open, clientType]);

  async function handleStart() {
    if (!selectedId) { toast.error("Please select a process template"); return; }
    setStarting(true);
    try {
      const res = await fetch("/api/admin/processes/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, processTemplateId: selectedId, notes }),
      });
      const data = await res.json() as { error?: string; process?: { id: string }; available?: number; total?: number };
      if (!res.ok) throw new Error(data.error ?? "Start failed");
      toast.success(`Process started — ${data.available}/${data.total} documents auto-linked`);
      setOpen(false);
      router.push(`/admin/clients/${clientId}/processes/${data.process!.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Start failed");
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-1.5"
      >
        <Rocket className="h-3.5 w-3.5" />
        Start Process
      </Button>

      <Dialog open={open} onOpenChange={(o) => setOpen(o)} disablePointerDismissal>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Launch a Process</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Process template</Label>
              <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? "")}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.description && (
                        <span className="text-gray-400 ml-1 text-xs">— {t.description}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Any notes about this process…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={handleStart}
                disabled={!selectedId || starting}
                className="bg-brand-navy hover:bg-brand-blue"
              >
                {starting ? "Starting…" : "Start Process"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
