// B-130 — Services table for /admin/queue. Replaces the legacy
// ApplicationTable for the queue surface. Batches 2-4 build this up:
// Batch 2 ships the rows + client-side search; Batch 3 adds the
// assigned-officer filter and "Assigned to me" chip; Batch 4 adds the
// multi-select status chip row.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/services/statusChain";

export interface ServiceRow {
  id: string;
  service_number: string | null;
  status: string;
  updated_at: string;
  created_at: string;
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
  template_name: string | null;
  primary_profile_name: string | null;
}

interface Props {
  services: ServiceRow[];
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  return `${mo}mo ago`;
}

export function ServicesTable({ services }: Props) {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    return services
      .filter((s) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          s.service_number?.toLowerCase().includes(q) ||
          s.primary_profile_name?.toLowerCase().includes(q) ||
          s.template_name?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ta = new Date(a.updated_at).getTime();
        const tb = new Date(b.updated_at).getTime();
        return sortDir === "desc" ? tb - ta : ta - tb;
      });
  }, [services, search, sortDir]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by service #, client or template…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-sm text-gray-500 ml-auto">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Service #
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Client
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Template
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Status
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Assigned to
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                <button
                  className="flex items-center gap-1 hover:text-brand-navy"
                  onClick={() =>
                    setSortDir(sortDir === "desc" ? "asc" : "desc")
                  }
                >
                  Updated
                  {sortDir === "desc" ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No services found
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/services/${s.id}`}
                      className="text-brand-navy hover:underline"
                    >
                      {s.service_number ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.primary_profile_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {s.template_name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        getStatusBadgeClass(s.status),
                      )}
                    >
                      {getStatusLabel(s.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {s.assigned_admin_name ?? (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-gray-500"
                    title={new Date(s.updated_at).toLocaleString()}
                  >
                    {relativeTime(s.updated_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/services/${s.id}`}>
                      <Button variant="outline" size="sm">
                        Open
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
