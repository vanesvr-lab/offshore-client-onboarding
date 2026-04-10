"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils/formatters";
import type { ApplicationStatus } from "@/types";

export interface ApplicationRow {
  id: string;
  business_name: string | null;
  reference_number: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  companyName: string | null;
  serviceName: string | null;
}

interface ApplicationsTableProps {
  applications: ApplicationRow[];
}

export function ApplicationsTable({ applications }: ApplicationsTableProps) {
  const [search, setSearch] = useState("");
  const router = useRouter();

  const filtered = applications.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (a.business_name?.toLowerCase().includes(q) ?? false) ||
      (a.companyName?.toLowerCase().includes(q) ?? false) ||
      (a.serviceName?.toLowerCase().includes(q) ?? false) ||
      a.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by application, company, service or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Application</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Company</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Service</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Stage</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Last Updated</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {applications.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No applications yet
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No applications match your search
                </td>
              </tr>
            ) : (
              filtered.map((app) => (
                <tr
                  key={app.id}
                  className="hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/admin/applications/${app.id}`)}
                >
                  <td className="px-4 py-3 font-medium text-brand-navy">
                    {app.reference_number || app.business_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {app.companyName || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {app.serviceName || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={app.status as ApplicationStatus} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(app.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDate(app.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 max-w-[160px]">
                    {app.admin_notes
                      ? app.admin_notes.length > 60
                        ? app.admin_notes.slice(0, 60) + "…"
                        : app.admin_notes
                      : "—"}
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
