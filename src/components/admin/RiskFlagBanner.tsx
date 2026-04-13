"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RiskFlag } from "@/types";

interface RiskFlagBannerProps {
  flags: RiskFlag[];
  clientId: string;
  kycRecordId: string;
  /** Called after a flag is dismissed so parent can refresh data */
  onFlagDismissed?: (updatedFlags: RiskFlag[]) => void;
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    bg: "bg-red-50 border-red-200",
    iconColor: "text-red-500",
    titleColor: "text-red-800",
    textColor: "text-red-700",
    badge: "bg-red-100 text-red-700",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50 border-amber-200",
    iconColor: "text-amber-500",
    titleColor: "text-amber-800",
    textColor: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50 border-blue-200",
    iconColor: "text-blue-500",
    titleColor: "text-blue-800",
    textColor: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
  },
};

function FlagRow({
  flag,
  clientId,
  kycRecordId,
  onDismissed,
}: {
  flag: RiskFlag;
  clientId: string;
  kycRecordId: string;
  onDismissed: (type: string, reason: string) => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const config = SEVERITY_CONFIG[flag.severity];
  const Icon = config.icon;

  async function handleDismiss() {
    if (!reason.trim()) {
      toast.error("Please provide a reason for dismissing this flag");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/kyc/${clientId}/dismiss-flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId, flagType: flag.type, reason: reason.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to dismiss flag");
      onDismissed(flag.type, reason.trim());
      toast.success("Flag dismissed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss flag");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-lg border px-4 py-3 space-y-2 ${config.bg}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${config.badge}`}>
              {flag.severity}
            </span>
            <p className={`text-sm font-medium ${config.titleColor}`}>{flag.message}</p>
          </div>
          {flag.suggestedAction && (
            <p className={`text-xs mt-0.5 ${config.textColor}`}>
              Suggested: {flag.suggestedAction.replace(/_/g, " ")}
            </p>
          )}
        </div>
        <button
          onClick={() => setDismissing((d) => !d)}
          className={`shrink-0 text-xs underline ${config.textColor} hover:opacity-70`}
        >
          {dismissing ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {dismissing && (
        <div className="space-y-2 pt-1">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Document your reason for dismissing this risk flag…"
            rows={2}
            className="text-xs resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={() => setDismissing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs h-7 bg-brand-navy hover:bg-brand-blue"
              onClick={handleDismiss}
              disabled={saving || !reason.trim()}
            >
              {saving ? "Saving…" : "Dismiss Flag"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RiskFlagBanner({ flags, clientId, kycRecordId, onFlagDismissed }: RiskFlagBannerProps) {
  const [localFlags, setLocalFlags] = useState<RiskFlag[]>(flags);

  const activeFlags = localFlags.filter((f) => !f.dismissed);

  if (activeFlags.length === 0) return null;

  function handleDismissed(type: string, reason: string) {
    const updated = localFlags.map((f) =>
      f.type === type ? { ...f, dismissed: true, dismissedReason: reason } : f
    );
    setLocalFlags(updated);
    onFlagDismissed?.(updated);
  }

  // Sort: critical first, then warning, then info
  const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
  const sorted = [...activeFlags].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold text-gray-700">
          {activeFlags.length} risk indicator{activeFlags.length !== 1 ? "s" : ""} detected
        </p>
      </div>
      {sorted.map((flag) => (
        <FlagRow
          key={flag.type}
          flag={flag}
          clientId={clientId}
          kycRecordId={kycRecordId}
          onDismissed={handleDismissed}
        />
      ))}
    </div>
  );
}
