"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils/formatters";
import type { ClientAccountManager } from "@/types";

interface AdminOption {
  user_id: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

interface AccountManagerPanelProps {
  clientId: string;
  current: (ClientAccountManager & {
    profiles: { full_name: string | null; email: string | null } | null;
  }) | null;
  history: (ClientAccountManager & {
    profiles: { full_name: string | null; email: string | null } | null;
  })[];
  admins: AdminOption[];
}

export function AccountManagerPanel({
  clientId,
  current,
  history,
  admins,
}: AccountManagerPanelProps) {
  const router = useRouter();
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function assignManager() {
    if (!selectedAdminId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/account-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId: selectedAdminId,
          currentManagerId: current?.id ?? null,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to update");
      toast.success("Account manager updated");
      setSelectedAdminId("");
      setNotes("");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  const currentAdminName =
    current?.profiles?.full_name ||
    current?.profiles?.email ||
    "Unassigned";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-brand-navy">
          Account Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current manager */}
        <div className="rounded-lg bg-gray-50 px-3 py-2.5">
          {current ? (
            <>
              <p className="font-medium text-brand-navy text-sm">
                {currentAdminName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Since {formatDate(current.started_at)}
              </p>
              {current.notes && (
                <p className="text-xs text-gray-400 mt-1 italic">
                  {current.notes}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No manager assigned</p>
          )}
        </div>

        {/* Assign new manager */}
        <div className="space-y-2">
          <Label className="text-xs text-gray-600">Assign manager</Label>
          <Select
            value={selectedAdminId}
            onValueChange={(v) => setSelectedAdminId(v ?? "")}
          >
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select admin…" />
            </SelectTrigger>
            <SelectContent>
              {admins.map((a) => (
                <SelectItem key={a.user_id} value={a.user_id}>
                  {a.profiles?.full_name || a.profiles?.email || a.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Reason for change (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <Button
            size="sm"
            onClick={assignManager}
            disabled={!selectedAdminId || saving}
            className="bg-brand-navy hover:bg-brand-blue w-full"
          >
            {saving ? "Saving…" : "Assign"}
          </Button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <button
              className="text-xs text-brand-blue hover:underline"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "Hide" : "Show"} history ({history.length})
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-2">
                {history.map((h) => (
                  <li key={h.id} className="text-xs text-gray-500 border-l-2 border-gray-200 pl-2">
                    <span className="font-medium text-gray-700">
                      {h.profiles?.full_name || h.profiles?.email || "Unknown"}
                    </span>
                    <br />
                    {formatDate(h.started_at)}
                    {h.ended_at ? ` → ${formatDate(h.ended_at)}` : " → present"}
                    {h.notes && (
                      <span className="block text-gray-400 italic mt-0.5">
                        {h.notes}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
