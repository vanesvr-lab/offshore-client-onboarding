import { formatDateTime, formatActionLabel } from "@/lib/utils/formatters";
import type { AuditLogEntry } from "@/types";

interface AuditTrailProps {
  entries: (AuditLogEntry & { profiles?: { full_name: string | null } })[];
}

export function AuditTrail({ entries }: AuditTrailProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">No audit events yet.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 text-sm">
          <div className="flex flex-col items-center">
            <div className="h-2 w-2 rounded-full bg-brand-navy mt-1.5 shrink-0" />
            <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
          </div>
          <div className="pb-3 min-w-0">
            <p className="font-medium text-gray-800">
              {formatActionLabel(entry.action)}
            </p>
            {entry.profiles?.full_name && (
              <p className="text-gray-500 text-xs">
                by {entry.profiles.full_name}
              </p>
            )}
            {entry.detail && Object.keys(entry.detail).length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {Object.entries(entry.detail)
                  .filter(([, v]) => v !== null)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {formatDateTime(entry.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
