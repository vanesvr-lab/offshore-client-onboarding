"use client";

import Link from "next/link";
import { formatActionLabel } from "@/lib/utils/formatters";

export interface ActivityEntry {
  id: string;
  action: string;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
  application_id: string | null;
  detail: Record<string, unknown> | null;
  applicationName?: string | null;
  applicationHref?: string | null;
}

interface ActivityFeedProps {
  entries: ActivityEntry[];
  viewAllHref?: string;
}

function timeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function describeAction(entry: ActivityEntry): string {
  const { action, actor_name, detail } = entry;
  const name = actor_name ?? "System";
  switch (action) {
    case "status_changed": {
      const to = ((detail?.to as string) ?? "").replace(/_/g, " ");
      return `${name} moved to ${to}`;
    }
    case "document_uploaded":
      return `${name} uploaded a document`;
    case "document_verified":
      return "Document automatically verified";
    case "admin_override":
      return `${name} manually overrode document`;
    case "email_sent":
      return `Email sent by ${name}`;
    default:
      return `${name}: ${formatActionLabel(action)}`;
  }
}

const AVATAR_BY_ROLE: Record<string, string> = {
  admin: "bg-brand-navy text-white",
  client: "bg-blue-100 text-blue-700",
  system: "bg-gray-100 text-gray-500",
};

export function ActivityFeed({ entries, viewAllHref }: ActivityFeedProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 py-2">No recent activity.</p>;
  }

  return (
    <div>
      {viewAllHref && (
        <div className="flex justify-end mb-3">
          <Link href={viewAllHref} className="text-xs text-brand-blue hover:underline">
            View all
          </Link>
        </div>
      )}
      <ul className="space-y-4">
        {entries.map((entry) => {
          const role = entry.actor_role ?? "system";
          const avatarClass = AVATAR_BY_ROLE[role] ?? AVATAR_BY_ROLE.system;
          const note =
            entry.action === "status_changed"
              ? (entry.detail?.note as string | null) ?? null
              : null;

          return (
            <li key={entry.id} className="flex items-start gap-3">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${avatarClass}`}
              >
                {getInitials(entry.actor_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 leading-snug">
                  {describeAction(entry)}
                  {entry.applicationName && entry.applicationHref && (
                    <span className="text-gray-500">
                      {" — "}
                      <Link
                        href={entry.applicationHref}
                        className="text-brand-blue hover:underline"
                      >
                        {entry.applicationName}
                      </Link>
                    </span>
                  )}
                </p>
                {note && (
                  <p className="text-xs text-gray-500 italic mt-0.5 truncate">
                    &ldquo;{note}&rdquo;
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{timeAgo(entry.created_at)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
