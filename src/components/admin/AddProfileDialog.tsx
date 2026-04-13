"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { KycRecord, DueDiligenceLevel } from "@/types";

interface AddProfileDialogProps {
  clientId: string;
  accountDdLevel: DueDiligenceLevel;
  hasPrimary: boolean;
  onCreated: (profile: KycRecord) => void;
  onClose: () => void;
}

const ROLE_OPTIONS = [
  { value: "director", label: "Director" },
  { value: "shareholder", label: "Shareholder" },
  { value: "ubo", label: "UBO" },
];

export function AddProfileDialog({
  clientId,
  hasPrimary,
  onCreated,
  onClose,
}: AddProfileDialogProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>(!hasPrimary ? "primary_client" : "director");
  const [shareholding, setShareholding] = useState("");
  const [saving, setSaving] = useState(false);

  const roles = !hasPrimary
    ? [{ value: "primary_client", label: "Primary Client" }, ...ROLE_OPTIONS]
    : ROLE_OPTIONS;

  async function handleCreate() {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          role,
          shareholdingPercentage: role === "shareholder" && shareholding ? parseFloat(shareholding) : null,
        }),
      });
      const data = await res.json() as { error?: string; kycRecord?: KycRecord };
      if (!res.ok) throw new Error(data.error ?? "Failed to create profile");
      onCreated(data.kycRecord!);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Add Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Full name <span className="text-red-400">*</span></Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="As it appears on passport"
              className="text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Email <span className="text-gray-400 text-xs">(required to send invite)</span></Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Phone</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Role <span className="text-red-400">*</span></Label>
            <Select value={role} onValueChange={(v) => setRole(v ?? "director")}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-sm">{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {role === "shareholder" && (
            <div className="space-y-1.5">
              <Label className="text-sm">Shareholding %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={shareholding}
                onChange={(e) => setShareholding(e.target.value)}
                placeholder="e.g. 25"
                className="text-sm"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={saving || !fullName.trim()}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? "Creating…" : "Create Profile"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
