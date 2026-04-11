"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import React from "react";
import { Search, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AuditEntry {
  id: string;
  application_id: string | null;
  actor_id: string | null;
  actor_role: "client" | "admin" | "system" | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
  application?: { business_name: string | null; reference_number: string | null } | null;
}

interface ClientAuditTrailDialogProps {
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fullDate(ts: string): string {
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatAction(action: string): string {
  const LABELS: Record<string, string> = {
    status_changed: "Status changed",
    document_uploaded: "Document uploaded",
    document_verified: "Document verified",
    document_override: "Document overridden",
    document_reviewed: "Document reviewed",
    email_sent: "Email sent",
    application_created: "Application created",
    application_submitted: "Application submitted",
    notes_updated: "Notes updated",
    rejection_reason_set: "Rejection reason set",
    field_updated: "Field updated",
    risk_rating_changed: "Risk rating changed",
    client_deleted: "Client deleted",
    account_manager_assigned: "Account manager assigned",
    account_manager_removed: "Account manager removed",
  };
  return LABELS[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();
}

const AVATAR_COLORS: Record<string, string> = {
  admin: "bg-brand-navy text-white",
  client: "bg-blue-100 text-blue-700",
  system: "bg-gray-200 text-gray-500",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand-navy/10 text-brand-navy",
  client: "bg-blue-50 text-blue-700",
  system: "bg-gray-100 text-gray-500",
};

// ── Row ────────────────────────────────────────────────────────────────────

function EntryRow({
  entry,
  index,
}: {
  entry: AuditEntry;
  index: number;
}) {
  const [open, setOpen] = useState(false);

  const actorRole = entry.actor_role ?? "system";
  const actorName =
    (entry.profiles as { full_name?: string | null } | null)?.full_name ??
    entry.actor_name ??
    (actorRole === "system" ? "System" : "Unknown");

  const prevStatus = (entry.previous_value?.status ?? entry.previous_value?.value) as string | undefined;
  const newStatus = (entry.new_value?.status ?? entry.new_value?.value) as string | undefined;

  const detailEntries = Object.entries(entry.detail ?? {}).filter(
    ([k]) => !["note", "notes", "status"].includes(k)
  );
  const noteText =
    (entry.detail?.note as string | undefined) ??
    (entry.detail?.notes as string | undefined) ??
    null;

  const hasDetail =
    !!noteText ||
    (prevStatus && newStatus) ||
    detailEntries.length > 0 ||
    !!entry.application;

  const appRef = entry.application?.reference_number ?? entry.application?.business_name;

  return (
    <React.Fragment>
      <tr
        className={`border-b last:border-0 ${index % 2 === 0 ? "bg-white" : "bg-gray-50"} ${hasDetail ? "cursor-pointer hover:bg-blue-50/30" : ""}`}
        onClick={() => hasDetail && setOpen((v) => !v)}
      >
        {/* Date/time */}
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap align-top">
          <span title={fullDate(entry.created_at)}>{timeAgo(entry.created_at)}</span>
        </td>

        {/* User */}
        <td className="px-3 py-2 align-top">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${AVATAR_COLORS[actorRole] ?? AVATAR_COLORS.system}`}>
              {getInitials(actorName)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate max-w-[120px]">{actorName}</p>
              <span className={`text-[10px] px-1 py-0.5 rounded capitalize ${ROLE_BADGE[actorRole] ?? ROLE_BADGE.system}`}>
                {actorRole}
              </span>
            </div>
          </div>
        </td>

        {/* Action */}
        <td className="px-3 py-2 align-top">
          <p className="text-xs font-medium text-gray-800">{formatAction(entry.action)}</p>
          {prevStatus && newStatus && (
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">
              {String(prevStatus).replace(/_/g, " ")} → {String(newStatus).replace(/_/g, " ")}
            </p>
          )}
          {appRef && (
            <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[160px]">{appRef}</p>
          )}
        </td>

        {/* Details summary / expand */}
        <td className="px-3 py-2 align-top">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              {noteText && (
                <p className="text-xs italic text-gray-500 truncate max-w-[200px]">&ldquo;{noteText}&rdquo;</p>
              )}
              {!noteText && detailEntries.length > 0 && (
                <p className="text-xs text-gray-400 truncate max-w-[200px]">
                  {detailEntries.slice(0, 2).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}
                </p>
              )}
            </div>
            {hasDetail && (
              <span className="text-gray-300 shrink-0 mt-0.5">
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {open && hasDetail && (
        <tr className={index % 2 === 0 ? "bg-blue-50/20" : "bg-blue-50/20"}>
          <td colSpan={4} className="px-4 py-3 border-b border-gray-100">
            <div className="space-y-1.5 text-xs text-gray-600">
              {entry.application && (
                <p>
                  <span className="text-gray-400">Application: </span>
                  <span className="font-medium">{entry.application.reference_number ?? entry.application.business_name ?? entry.application_id}</span>
                </p>
              )}
              {prevStatus && newStatus && (
                <p>
                  <span className="text-gray-400">Status: </span>
                  <span className="font-mono">{String(prevStatus).replace(/_/g, " ")}</span>
                  {" → "}
                  <span className="font-mono font-medium">{String(newStatus).replace(/_/g, " ")}</span>
                </p>
              )}
              {noteText && (
                <p className="italic border-l-2 border-brand-accent pl-2 text-gray-700">&ldquo;{noteText}&rdquo;</p>
              )}
              {detailEntries.map(([k, v]) => (
                <p key={k}>
                  <span className="text-gray-400 capitalize">{k.replace(/_/g, " ")}: </span>
                  {String(v)}
                </p>
              ))}
              <p className="text-gray-400 pt-0.5">{fullDate(entry.created_at)}</p>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────

export function ClientAuditTrailDialog({
  clientId,
  clientName,
  open,
  onOpenChange,
}: ClientAuditTrailDialogProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 50;

  const fetchEntries = useCallback(
    async (searchVal: string, offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const qs = new URLSearchParams({
          limit: String(LIMIT),
          offset: String(offset),
          ...(searchVal ? { search: searchVal } : {}),
        });
        const res = await fetch(`/api/admin/clients/${clientId}/audit-trail?${qs}`);
        const data = (await res.json()) as { entries?: AuditEntry[]; total?: number };
        const newEntries = data.entries ?? [];
        setTotal(data.total ?? 0);
        if (append) {
          setEntries((prev) => [...prev, ...newEntries]);
        } else {
          setEntries(newEntries);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [clientId]
  );

  // Load on open
  useEffect(() => {
    if (!open) return;
    setSearch("");
    fetchEntries("", 0, false);
  }, [open, fetchEntries]);

  // Debounced search
  function handleSearch(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchEntries(val, 0, false);
    }, 300);
  }

  function loadMore() {
    fetchEntries(search, entries.length, true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent
        className="max-w-4xl w-full p-0 flex flex-col overflow-hidden"
        showCloseButton={false}
        style={{ maxHeight: "85vh" }}
      >
        {/* Header */}
        <DialogHeader className="px-5 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base text-brand-navy font-semibold">
              Audit Trail — {clientName}
            </DialogTitle>
            <button
              onClick={() => onOpenChange(false)}
              className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Search */}
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search actions, users, details…"
              className="pl-8 text-sm h-8"
            />
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">
              {search ? "No results match your search." : "No audit events yet."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-400 w-[90px]">Date/Time</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-400 w-[150px]">User</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-400 w-[180px]">Action</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-400">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <EntryRow key={entry.id} entry={entry} index={i} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Showing {entries.length} of {total} {total === 1 ? "entry" : "entries"}
          </p>
          {entries.length < total && (
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
              className="gap-1.5"
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Load more
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
