"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function WorkflowMilestonesCard({ clientId, milestones: initial }: WorkflowMilestonesCardProps) {
  const [milestones, setMilestones] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  async function toggle(key: keyof typeof milestones) {
    const newVal = milestones[key] ? null : new Date().toISOString();
    setSaving(key);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: newVal }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setMilestones((prev) => ({ ...prev, [key]: newVal }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(null);
    }
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
      <CardContent className="space-y-2">
        {MILESTONES.map(({ key, label }) => {
          const done = !!milestones[key];
          const date = fmtDate(milestones[key]);
          return (
            <button
              key={key}
              type="button"
              disabled={saving === key}
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between text-left hover:bg-gray-50 rounded px-2 py-1.5 transition-colors group"
            >
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-300 shrink-0 group-hover:text-gray-400" />
                )}
                <span className={`text-sm ${done ? "text-gray-700" : "text-gray-500"}`}>{label}</span>
              </div>
              {date && <span className="text-xs text-gray-400">{date}</span>}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
