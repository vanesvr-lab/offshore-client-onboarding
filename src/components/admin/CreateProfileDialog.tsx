"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateProfileDialog({ open, onClose, onCreated }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [recordType, setRecordType] = useState<"individual" | "organisation">("individual");
  const [isRepresentative, setIsRepresentative] = useState(false);
  const [ddLevel, setDdLevel] = useState<"sdd" | "cdd" | "edd">("cdd");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/profiles-v2/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          record_type: recordType,
          is_representative: isRepresentative,
          due_diligence_level: ddLevel,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create profile");
      toast.success("Profile created");
      // Reset form
      setFullName("");
      setEmail("");
      setPhone("");
      setRecordType("individual");
      setIsRepresentative(false);
      setDdLevel("cdd");
      onCreated(data.id!);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">New Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Record type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <div className="flex gap-2">
              {(["individual", "organisation"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRecordType(t)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border capitalize transition-colors ${
                    recordType === t
                      ? "bg-brand-navy text-white border-brand-navy"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Representative toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isRepresentative}
              onChange={(e) => setIsRepresentative(e.target.checked)}
              className="rounded border-gray-300"
              id="is-rep"
            />
            <label htmlFor="is-rep" className="text-sm text-gray-700">
              This is a representative (no KYC required)
            </label>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Full Name <span className="text-red-400">*</span>
            </label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Smith"
              autoFocus
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+230 5XXX XXXX"
            />
          </div>

          {/* DD Level */}
          {!isRepresentative && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Due Diligence Level</label>
              <select
                value={ddLevel}
                onChange={(e) => setDdLevel(e.target.value as "sdd" | "cdd" | "edd")}
                className="w-full h-9 rounded-md border border-gray-200 px-3 text-sm"
              >
                <option value="sdd">SDD — Simplified</option>
                <option value="cdd">CDD — Standard</option>
                <option value="edd">EDD — Enhanced</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={saving || !fullName.trim()}
              className="flex-1 bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                "Create Profile"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
