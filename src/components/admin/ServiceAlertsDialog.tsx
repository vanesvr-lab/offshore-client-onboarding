"use client";

// B-108 Batch 3 — Service alerts modal.
//
// Two sections inside one dialog:
//   1. Open alerts — combined `visibleAutoAlerts` + `openManualAlerts`,
//      sorted by severity (critical > warning > info) then created date.
//      Each row shows severity icon + label, title, note, and an action
//      button (Resolve for manual, Dismiss for auto).
//   2. Resolved alerts — collapsible list at the bottom for audit trail.
//
// Plus an inline + form for adding a manual alert (title/note/severity).
//
// All mutations refresh the page via router.refresh() so the auto-alert
// recompute + dismissal/manual lists stay in sync.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils/formatters";
import {
  severityRank,
  type AutoAlert,
  type AutoAlertSeverity,
} from "@/lib/alerts/computeAutoAlerts";
import type { ManualServiceAlert } from "@/app/(admin)/admin/services/[id]/page";

const SEVERITY_OPTIONS: AutoAlertSeverity[] = ["info", "warning", "critical"];

function severityIcon(severity: AutoAlertSeverity) {
  if (severity === "critical") return <AlertTriangle className="h-4 w-4 text-red-600" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <Info className="h-4 w-4 text-gray-400" />;
}

function severityLabelClass(severity: AutoAlertSeverity): string {
  if (severity === "critical") return "text-red-700 bg-red-50 border-red-200";
  if (severity === "warning") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-gray-600 bg-gray-50 border-gray-200";
}

export function ServiceAlertsDialog({
  open,
  onClose,
  serviceId,
  autoAlerts,
  manualAlerts,
}: {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  autoAlerts: AutoAlert[];
  manualAlerts: ManualServiceAlert[];
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newSeverity, setNewSeverity] = useState<AutoAlertSeverity>("info");
  const [adding, setAdding] = useState(false);

  const openManual = useMemo(
    () => manualAlerts.filter((m) => m.status === "open"),
    [manualAlerts],
  );
  const resolvedManual = useMemo(
    () => manualAlerts.filter((m) => m.status === "resolved"),
    [manualAlerts],
  );

  // Combine into a single sortable list. Manual rows keyed `manual_<id>`
  // so we can distinguish in the action handler.
  type CombinedRow =
    | { kind: "auto"; alert: AutoAlert }
    | { kind: "manual"; alert: ManualServiceAlert };

  const combinedOpen: CombinedRow[] = useMemo(() => {
    const rows: CombinedRow[] = [
      ...autoAlerts.map((a) => ({ kind: "auto" as const, alert: a })),
      ...openManual.map((m) => ({ kind: "manual" as const, alert: m })),
    ];
    rows.sort((a, b) => {
      const sa = severityRank(a.alert.severity);
      const sb = severityRank(b.alert.severity);
      if (sa !== sb) return sb - sa;
      const da =
        a.kind === "auto" ? a.alert.detectedAt : a.alert.created_at;
      const db =
        b.kind === "auto" ? b.alert.detectedAt : b.alert.created_at;
      return new Date(db).getTime() - new Date(da).getTime();
    });
    return rows;
  }, [autoAlerts, openManual]);

  async function dismissAuto(key: string) {
    setBusyKey(`auto_${key}`);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/alerts/dismiss-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_alert_key: key }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Dismiss failed");
      }
      toast.success("Alert dismissed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dismiss failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function resolveManual(alertId: string) {
    setBusyKey(`manual_${alertId}`);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/alerts/${alertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Resolve failed");
      }
      toast.success("Alert resolved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function addManual() {
    const title = newTitle.trim();
    if (!title) {
      toast.error("Title is required");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, note: newNote.trim() || null, severity: newSeverity }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Create failed");
      }
      toast.success("Alert added");
      setNewTitle("");
      setNewNote("");
      setNewSeverity("info");
      setShowAddForm(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[min(100vw-2rem,42rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-navy" />
            Service Alerts
            <span className="text-xs font-normal text-gray-500">
              ({combinedOpen.length} open)
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {combinedOpen.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No open alerts on this service.
            </p>
          ) : (
            combinedOpen.map((row) => {
              const isAuto = row.kind === "auto";
              const key = isAuto ? `auto_${row.alert.key}` : `manual_${row.alert.id}`;
              const busy = busyKey === key;
              return (
                <div
                  key={key}
                  className="border rounded-lg px-3 py-2 flex items-start gap-3 bg-white"
                >
                  <div className="mt-0.5">{severityIcon(row.alert.severity)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 border rounded ${severityLabelClass(row.alert.severity)}`}
                      >
                        {row.alert.severity}
                      </span>
                      {isAuto ? (
                        <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                          auto-detected
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                          manual · {formatDateTime(row.alert.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-800 mt-0.5">
                      {row.alert.title}
                    </p>
                    {(isAuto ? row.alert.note : row.alert.note) && (
                      <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">
                        {isAuto ? row.alert.note : row.alert.note}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() =>
                      isAuto ? dismissAuto(row.alert.key) : resolveManual(row.alert.id)
                    }
                    disabled={busy}
                    className="h-7 px-2 text-xs bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isAuto ? (
                      "Dismiss"
                    ) : (
                      "Resolve"
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* Add-manual form */}
        <div className="border-t pt-3 space-y-2">
          {showAddForm ? (
            <div className="space-y-2">
              <Input
                placeholder="Alert title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <Textarea
                placeholder="Optional note"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={2}
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {SEVERITY_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setNewSeverity(s)}
                      className={`px-2.5 py-1 rounded-full text-xs border capitalize ${
                        newSeverity === s
                          ? severityLabelClass(s)
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => { setShowAddForm(false); setNewTitle(""); setNewNote(""); }}
                    disabled={adding}
                    className="h-8 px-3 text-xs bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void addManual()}
                    disabled={adding || !newTitle.trim()}
                    className="h-8 px-3 text-xs bg-brand-navy text-white hover:bg-brand-navy/90 disabled:opacity-50"
                  >
                    {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save alert"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddForm(true)}
              className="h-8 px-3 text-xs bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add manual alert
            </Button>
          )}
        </div>

        {/* Resolved list */}
        {resolvedManual.length > 0 && (
          <div className="border-t pt-2">
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showResolved ? "" : "-rotate-90"}`}
              />
              Resolved ({resolvedManual.length})
            </button>
            {showResolved && (
              <div className="space-y-1.5 mt-2">
                {resolvedManual.map((m) => (
                  <div key={m.id} className="border rounded-md px-2.5 py-1.5 bg-gray-50/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs font-medium text-gray-700 truncate">
                        {m.title}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        resolved {m.resolved_at ? formatDateTime(m.resolved_at) : "—"}
                      </span>
                    </div>
                    {m.note && (
                      <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">
                        {m.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
