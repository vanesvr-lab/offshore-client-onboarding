"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, User } from "lucide-react";

interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
  is_primary: boolean;
}

interface ProfileSelectorProps {
  clientId: string;
  role: "director" | "shareholder" | "ubo";
  onSelect: (kycRecordId: string | null, newName?: string) => void;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
};

export function ProfileSelector({ clientId, role, onSelect, onClose }: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<"new" | string>("new");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch(`/api/clients/${clientId}/profiles`)
      .then((r) => r.json())
      .then((data: { profiles?: ProfileOption[] }) => {
        setProfiles(data.profiles ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  function handleConfirm() {
    if (selected === "new") {
      onSelect(null, newName.trim() || undefined);
    } else {
      onSelect(selected);
    }
  }

  const canConfirm = selected !== "new" || newName.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Add {ROLE_LABELS[role]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {loading ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading profiles…</p>
          ) : (
            <>
              {profiles.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium mb-2">Select an existing profile</p>
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        selected === p.id
                          ? "border-brand-navy bg-brand-navy/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-brand-navy">
                            {p.full_name ?? "Unnamed"}
                            {p.is_primary && (
                              <span className="ml-1.5 text-[10px] bg-brand-navy/10 text-brand-navy px-1 py-0.5 rounded">Primary</span>
                            )}
                          </p>
                          {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-2 text-xs text-gray-400">or</span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setSelected("new")}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  selected === "new"
                    ? "border-brand-navy bg-brand-navy/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <p className="text-sm font-medium text-brand-navy">Create new profile</p>
                </div>
              </button>

              {selected === "new" && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-sm">Full name <span className="text-red-400">*</span></Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="As it appears on passport"
                    className="text-sm"
                    autoFocus
                  />
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || loading}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {selected === "new" ? "Create & Add" : "Add to Application"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
