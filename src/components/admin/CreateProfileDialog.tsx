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

export interface CreatedProfileSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  record_type: "individual" | "organisation";
  is_representative: boolean;
  due_diligence_level: "sdd" | "cdd" | "edd";
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Receives a summary of the newly-created profile so parents can
   *  splice it into local state without a refetch. */
  onCreated: (summary: CreatedProfileSummary) => void;
  /** B-134 — when true, the dialog is locked to creating a
   *  representative: the "This is a representative" toggle is hidden,
   *  is_representative is forced to true on submit, and the title
   *  reads "New Representative". Used by the AddDirector / per-director
   *  rep pickers that need to inline-create a rep on the fly. */
  forceIsRepresentative?: boolean;
}

export function CreateProfileDialog({
  open,
  onClose,
  onCreated,
  forceIsRepresentative = false,
}: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [recordType, setRecordType] = useState<"individual" | "organisation">("individual");
  const [isRepresentative, setIsRepresentative] = useState(false);
  const [ddLevel, setDdLevel] = useState<"sdd" | "cdd" | "edd">("cdd");
  const [saving, setSaving] = useState(false);

  const repFlag = forceIsRepresentative ? true : isRepresentative;

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
          is_representative: repFlag,
          due_diligence_level: ddLevel,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create profile");
      toast.success(forceIsRepresentative ? "Representative created" : "Profile created");
      const summary: CreatedProfileSummary = {
        id: data.id!,
        full_name: fullName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        record_type: recordType,
        is_representative: repFlag,
        due_diligence_level: ddLevel,
      };
      // Reset form
      setFullName("");
      setEmail("");
      setPhone("");
      setRecordType("individual");
      setIsRepresentative(false);
      setDdLevel("cdd");
      onCreated(summary);
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
          <DialogTitle className="text-brand-navy">
            {forceIsRepresentative ? "New Representative" : "New Profile"}
          </DialogTitle>
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

          {/* Representative toggle — hidden in forced-rep mode */}
          {!forceIsRepresentative && (
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
          )}

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

          {/* DD Level — hidden for representatives */}
          {!repFlag && (
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

          {/* B-134 — filing rep on a non-rep profile is set after
              creation via the per-director affordance on the service
              detail page (or via PATCH /api/admin/profiles-v2/[id]).
              The standalone create flow no longer asks for it; the
              text-input affordance from B-131 is gone. */}

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
                forceIsRepresentative ? "Create Representative" : "Create Profile"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
