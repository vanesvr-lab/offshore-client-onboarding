"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/formatters";

export interface ClientRow {
  id: string;
  company_name: string;
  created_at: string;
  ownerName: string | null;
  ownerEmail: string | null;
  managerName: string | null;
  appCount: number;
}

interface ClientsTableProps {
  clients: ClientRow[];
}

export function ClientsTable({ clients }: ClientsTableProps) {
  const [search, setSearch] = useState("");

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.company_name.toLowerCase().includes(q) ||
      (c.ownerName?.toLowerCase().includes(q) ?? false) ||
      (c.ownerEmail?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search clients by company or contact…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Company</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Primary Contact</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Account Manager</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Applications</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No clients yet
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No clients match your search
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-brand-navy hover:text-brand-blue hover:underline"
                    >
                      {client.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700">{client.ownerName || "—"}</p>
                    <p className="text-xs text-gray-400">{client.ownerEmail || ""}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {client.managerName ?? (
                      <span className="text-gray-300">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{client.appCount}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(client.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
