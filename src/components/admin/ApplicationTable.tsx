"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils/formatters";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { Application, ApplicationStatus } from "@/types";

type ApplicationWithRelations = Application & {
  clients?: { company_name: string | null };
  service_templates?: { name: string };
};

interface ApplicationTableProps {
  applications: ApplicationWithRelations[];
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Submitted", value: "submitted" },
  { label: "In Review", value: "in_review" },
  { label: "Pending Action", value: "pending_action" },
  { label: "Verification", value: "verification" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export function ApplicationTable({ applications }: ApplicationTableProps) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = applications
    .filter((a) => filter === "all" || a.status === filter)
    .filter((a) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        a.business_name?.toLowerCase().includes(q) ||
        a.clients?.company_name?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const ta = new Date(a.submitted_at || a.created_at).getTime();
      const tb = new Date(b.submitted_at || b.created_at).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Search by company or client name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v ?? "all")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-gray-500">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Company
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Service
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                Status
              </th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">
                <button
                  className="flex items-center gap-1 hover:text-brand-navy"
                  onClick={() =>
                    setSortDir(sortDir === "desc" ? "asc" : "desc")
                  }
                >
                  Submitted
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
                  colSpan={5}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  No applications found
                </td>
              </tr>
            ) : (
              filtered.map((app) => (
                <tr
                  key={app.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    {app.business_name || app.clients?.company_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {app.service_templates?.name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={app.status as ApplicationStatus} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(app.submitted_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/applications/${app.id}`}>
                      <Button variant="outline" size="sm">
                        Review
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
