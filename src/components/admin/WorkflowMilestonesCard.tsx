"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface WorkflowMilestonesCardProps {
  clientId: string;
  milestones: {
    loe_sent_at: string | null;
    invoice_sent_at: string | null;
    payment_received_at: string | null;
    portal_link_sent_at: string | null;
    kyc_completed_at: string | null;
    application_submitted_at: string | null;
  };
}

const MILESTONES = [
  { key: "loe_sent_at" as const, label: "LOE sent" },
  { key: "invoice_sent_at" as const, label: "Invoice sent" },
  { key: "payment_received_at" as const, label: "Payment received" },
  { key: "portal_link_sent_at" as const, label: "Portal link sent" },
  { key: "kyc_completed_at" as const, label: "KYC complete" },
  { key: "application_submitted_at" as const, label: "Application submitted" },
] as const;

function toDateInput(d: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function WorkflowMilestonesCard({ clientId, milestones: initial }: WorkflowMilestonesCardProps) {
  const [milestones, setMilestones] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  async function saveMilestone(key: keyof typeof milestones, value: string | null) {
    setSaving(key);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setMilestones((prev) => ({ ...prev, [key]: value }));
      setEditingDate(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(null);
    }
  }

  function toggle(key: keyof typeof milestones) {
    if (milestones[key]) {
      // Uncheck — clear the date
      saveMilestone(key, null);
    } else {
      // Check — default to today, save immediately
      const today = new Date(todayISO() + "T12:00:00Z").toISOString();
      saveMilestone(key, today);
    }
  }

  function handleDateChange(key: keyof typeof milestones, dateStr: string) {
    if (!dateStr) return;
    const val = new Date(dateStr + "T12:00:00Z").toISOString();
    saveMilestone(key, val);
  }

  const completedCount = MILESTONES.filter((m) => milestones[m.key]).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-brand-navy flex items-center justify-between">
          Workflow Milestones
          <span className="text-xs font-normal text-gray-400">{completedCount}/{MILESTONES.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {MILESTONES.map(({ key, label }) => {
          const done = !!milestones[key];
          const isEditing = editingDate === key;
          return (
            <div
              key={key}
              className="flex items-center justify-between hover:bg-gray-50 rounded px-2 py-1.5 transition-colors group"
            >
              <button
                type="button"
                disabled={saving === key}
                onClick={() => toggle(key)}
                className="flex items-center gap-2 text-left"
              >
                {done ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-300 shrink-0 group-hover:text-gray-400" />
                )}
                <span className={`text-sm ${done ? "text-gray-700" : "text-gray-500"}`}>{label}</span>
              </button>
              <div className="flex items-center gap-1.5">
                {done && !isEditing && (
                  <button
                    type="button"
                    onClick={() => setEditingDate(key)}
                    className="text-xs text-gray-400 hover:text-brand-blue hover:underline cursor-pointer"
                    title="Click to change date"
                  >
                    {fmtDate(milestones[key])}
                  </button>
                )}
                {done && isEditing && (
                  <Input
                    type="date"
                    defaultValue={toDateInput(milestones[key])}
                    className="h-7 w-36 text-xs"
                    autoFocus
                    onBlur={(e) => {
                      if (e.target.value) handleDateChange(key, e.target.value);
                      else setEditingDate(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleDateChange(key, (e.target as HTMLInputElement).value);
                      } else if (e.key === "Escape") {
                        setEditingDate(null);
                      }
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
