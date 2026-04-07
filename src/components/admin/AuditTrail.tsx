"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDateTime } from "@/lib/utils/formatters";
import type { AuditLogEntry } from "@/types";

interface AuditTrailProps {
  entries: (AuditLogEntry & { profiles?: { full_name: string | null } })[];
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDateTime(ts);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

const AVATAR_COLORS: Record<string, string> = {
  admin: "bg-brand-navy text-white",
  client: "bg-blue-100 text-blue-700",
  system: "bg-gray-100 text-gray-500",
};

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand-navy/10 text-brand-navy",
  client: "bg-blue-50 text-blue-700",
  system: "bg-gray-100 text-gray-500",
};

export function AuditTrail({ entries }: AuditTrailProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 py-4">No audit events yet.</p>;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-100">
      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-500 w-20">Time</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500 w-28">Actor</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">Action</th>
              <th className="w-5 px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((entry) => {
              const actorName =
                entry.actor_name || entry.profiles?.full_name || "System";
              const actorRole = entry.actor_role || "system";
              const isOpen = expanded.has(entry.id);

              const noteText =
                entry.action === "status_changed" && entry.detail
                  ? ((entry.detail as Record<string, unknown>).note as string | null) ?? null
                  : null;

              const prevStatus = (
                entry.previous_value as Record<string, string> | null
              )?.status;
              const newStatus = (
                entry.new_value as Record<string, string> | null
              )?.status;

              const detailEntries = entry.detail
                ? Object.entries(entry.detail as Record<string, unknown>).filter(
                    ([k, v]) =>
                      k !== "note" && v !== null && v !== undefined
                  )
                : [];

              const hasDetail =
                noteText ||
                (prevStatus && newStatus) ||
                detailEntries.length > 0;

              return (
                <React.Fragment key={entry.id}>
                  <tr
                    className={`transition-colors ${hasDetail ? "cursor-pointer hover:bg-gray-50" : ""}`}
                    onClick={() => hasDetail && toggle(entry.id)}
                  >
                    {/* Timestamp */}
                    <td
                      className="px-3 py-2.5 text-gray-400 whitespace-nowrap"
                      title={formatDateTime(entry.created_at)}
                    >
                      {timeAgo(entry.created_at)}
                    </td>

                    {/* Actor */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div
                          className={`h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                            AVATAR_COLORS[actorRole] ?? AVATAR_COLORS.system
                          }`}
                        >
                          {getInitials(actorName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-gray-700 max-w-[80px]">
                            {actorName}
                          </p>
                          <span
                            className={`text-[9px] px-1 rounded capitalize ${
                              ROLE_BADGE[actorRole] ?? ROLE_BADGE.system
                            }`}
                          >
                            {actorRole}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-gray-800">
                        {formatAction(entry.action)}
                      </span>
                      {prevStatus && newStatus && (
                        <span className="ml-1.5 font-mono text-gray-400 bg-gray-100 px-1 rounded text-[9px]">
                          {prevStatus} → {newStatus}
                        </span>
                      )}
                      {noteText && (
                        <p className="mt-0.5 italic text-gray-400 truncate max-w-[180px]">
                          &ldquo;{noteText}&rdquo;
                        </p>
                      )}
                    </td>

                    {/* Expand toggle */}
                    <td className="px-2 py-2.5 text-gray-300">
                      {hasDetail &&
                        (isOpen ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        ))}
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isOpen && hasDetail && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-3 bg-gray-50 border-b border-gray-100"
                      >
                        <div className="space-y-1.5 text-xs text-gray-600">
                          {noteText && (
                            <p className="italic border-l-2 border-brand-accent pl-2 text-gray-700">
                              &ldquo;{noteText}&rdquo;
                            </p>
                          )}
                          {prevStatus && newStatus && (
                            <p>
                              <span className="text-gray-400">Status change: </span>
                              <span className="font-mono">{prevStatus}</span>
                              {" → "}
                              <span className="font-mono">{newStatus}</span>
                            </p>
                          )}
                          {detailEntries.map(([k, v]) => (
                            <p key={k}>
                              <span className="text-gray-400 capitalize">
                                {k.replace(/_/g, " ")}:{" "}
                              </span>
                              {String(v)}
                            </p>
                          ))}
                          <p className="text-gray-400 pt-0.5">
                            {formatDateTime(entry.created_at)}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
