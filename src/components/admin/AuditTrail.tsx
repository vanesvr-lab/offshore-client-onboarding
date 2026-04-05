import { formatDateTime, formatActionLabel } from "@/lib/utils/formatters";
import type { AuditLogEntry } from "@/types";

interface AuditTrailProps {
  entries: (AuditLogEntry & { profiles?: { full_name: string | null } })[];
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand-navy/10 text-brand-navy",
  client: "bg-blue-50 text-blue-700",
  system: "bg-gray-100 text-gray-500",
};

export function AuditTrail({ entries }: AuditTrailProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">No audit events yet.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const actorName = entry.actor_name || entry.profiles?.full_name || "Unknown";
        const actorRole = entry.actor_role || "system";

        // Build a change summary from previous/new values
        let changeSummary: string | null = null;
        if (entry.previous_value && entry.new_value) {
          const prevStatus = (entry.previous_value as Record<string, string>).status;
          const newStatus = (entry.new_value as Record<string, string>).status;
          if (prevStatus && newStatus) {
            changeSummary = `${prevStatus} → ${newStatus}`;
          }
        }

        // Extra detail fields
        const detailText = entry.detail
          ? Object.entries(entry.detail as Record<string, unknown>)
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
              .join(" · ")
          : null;

        return (
          <li key={entry.id} className="flex gap-3 text-sm">
            <div className="flex flex-col items-center">
              <div className="h-2 w-2 rounded-full bg-brand-navy mt-1.5 shrink-0" />
              <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
            </div>
            <div className="pb-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-gray-800">
                  {formatActionLabel(entry.action)}
                </p>
                {changeSummary && (
                  <span className="text-xs font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                    {changeSummary}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-gray-500">
                  by {actorName}
                </p>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                    ROLE_BADGE[actorRole] ?? ROLE_BADGE.system
                  }`}
                >
                  {actorRole}
                </span>
              </div>
              {detailText && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {detailText}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDateTime(entry.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
