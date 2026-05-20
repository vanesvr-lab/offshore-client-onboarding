"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MiniProgressBar } from "@/components/shared/MiniProgressBar";
import type { AdminServiceRow, AdminOption } from "./page";
import {
  SERVICE_STATUS_ALL,
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/services/statusChain";

interface Props {
  rows: AdminServiceRow[];
  templateOptions: { id: string; name: string }[];
  // B-149 — admins list + currentUserId feed the new Assigned Officer
  // dropdown and the "Assigned to me" chip (parity with /admin/queue).
  admins: AdminOption[];
  currentUserId: string;
}

function statusBadge(status: string) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full ${getStatusBadgeClass(status)}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function ManagersCell({ managers }: { managers: { id: string; full_name: string }[] }) {
  if (managers.length === 0) return <span className="text-xs text-gray-400">—</span>;
  const shown = managers.slice(0, 2);
  const extra = managers.length - 2;
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((m) => (
        <span key={m.id} className="text-xs text-gray-700 truncate max-w-[160px]">
          {m.full_name}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[10px] text-gray-400">+{extra} more</span>
      )}
    </div>
  );
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function LastUpdatedCell({ at, by }: { at: string; by: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-700">{relativeTime(at)}</span>
      {by && <span className="text-[10px] text-gray-400">by {by}</span>}
    </div>
  );
}

// Get a short abbreviation from template name for the filter chip
function templateAbbr(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("global business")) return "GBC";
  if (lower.includes("authorised") || lower.includes("authorized")) return "AC";
  if (lower.includes("domestic")) return "DC";
  if (lower.includes("trust") || lower.includes("foundation")) return "TFF";
  if (lower.includes("relocation")) return "RLM";
  // Fall back: initials of the first 3 words
  return name
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function ServicesPageClient({ rows, templateOptions, admins, currentUserId }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  // B-149 — status filter converts from single-select to a multi-select
  // chip row (parity with /admin/queue's B-130 Batch 4). Empty set =
  // no status filter applied (show all). Closed isn't excluded by
  // default here because the services list view is the broader admin
  // surface; admins explicitly toggle it off when they want active work.
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  // B-149 — Assigned Officer dropdown + "Assigned to me" quick chip
  // (parity with /admin/queue). `mine` overrides the dropdown when on.
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [mine, setMine] = useState(false);

  function toggleStatus(s: string) {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const filtered = rows.filter((row) => {
    if (statusFilters.size > 0 && !statusFilters.has(row.status)) return false;
    if (templateFilter !== "all" && row.service_template_id !== templateFilter) return false;
    // Mine takes precedence over the dropdown so the two don't double-narrow.
    if (mine) {
      if (row.assigned_admin_id !== currentUserId) return false;
    } else if (assignedFilter === "unassigned") {
      if (row.assigned_admin_id !== null) return false;
    } else if (assignedFilter !== "all") {
      if (row.assigned_admin_id !== assignedFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const refMatch = row.service_number?.toLowerCase().includes(q) ?? false;
      const nameMatch = row.name?.toLowerCase().includes(q) ?? false;
      const managerMatch = row.managers.some((m) =>
        m.full_name.toLowerCase().includes(q)
      );
      if (!refMatch && !nameMatch && !managerMatch) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Services</h1>
          <p className="text-sm text-gray-500 mt-1">
            {rows.length} service{rows.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button
          onClick={() => router.push("/admin/services/new")}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          <PlusCircle className="h-4 w-4 mr-2" />
          New Service
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 mb-5 p-4 bg-white border rounded-lg">
        {/* B-149 — multi-select status chip row (parity with the queue's
            B-130 Batch 4). Empty = no status filter; clicking chips
            multi-selects. getStatusLabel for human-readable labels. */}
        <div className="flex flex-wrap gap-2">
          {SERVICE_STATUS_ALL.map((s) => {
            const active = statusFilters.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={active}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-full border transition-colors",
                  active
                    ? "border-brand-navy bg-brand-navy text-white"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50",
                )}
              >
                {getStatusLabel(s)}
              </button>
            );
          })}
        </div>

        {/* Search + assignee filter + "Assigned to me" chip */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ref, service name or manager..."
              className="pl-10"
            />
          </div>

          <Select
            value={mine ? "__mine__" : assignedFilter}
            onValueChange={(v) => {
              if (!v) return;
              if (v === "__mine__") {
                setMine(true);
              } else {
                setMine(false);
                setAssignedFilter(v);
              }
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Assigned Officer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All officers</SelectItem>
              <SelectItem value="unassigned">— Unassigned —</SelectItem>
              {admins.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => setMine((v) => !v)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors",
              mine
                ? "border-brand-navy bg-brand-navy text-white"
                : "border-brand-navy/30 bg-brand-navy/5 text-brand-navy hover:bg-brand-navy/10",
            )}
          >
            {mine ? "✓ Assigned to me" : "Assigned to me"}
          </button>

          <span className="text-sm text-gray-500 ml-auto">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Service-type chip row (kept from the original — unique to the
            services list view; not present on the queue). */}
        {templateOptions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 shrink-0">Service:</span>
            <button
              onClick={() => setTemplateFilter("all")}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                templateFilter === "all"
                  ? "bg-brand-navy text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {templateOptions.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplateFilter(t.id)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  templateFilter === t.id
                    ? "bg-brand-navy text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                title={t.name}
              >
                {templateAbbr(t.name)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[200px]">Ref</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[110px]">Status</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[180px]">Managers</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[150px]">Assigned To</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[90px]">Co. Setup</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[90px]">Financial</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[90px]">Banking</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[90px]">People & KYC</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[90px]">Docs</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[130px]">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-sm text-gray-400">
                  {search ||
                  statusFilters.size > 0 ||
                  templateFilter !== "all" ||
                  assignedFilter !== "all" ||
                  mine
                    ? "No services match your filters"
                    : "No services yet"}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/services/${row.id}`)}
                >
                  {/* Ref (+ service name secondary line per B-144) */}
                  <td className="py-3 px-4">
                    {row.service_number ? (
                      <div className="font-semibold text-brand-navy font-mono text-sm">
                        {row.service_number}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No ref</span>
                    )}
                    {row.name && (
                      <div
                        className="text-xs text-gray-500 truncate max-w-[180px]"
                        title={row.name}
                      >
                        {row.name}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4">
                    {statusBadge(row.status)}
                  </td>

                  {/* Managers */}
                  <td className="py-3 px-4">
                    <ManagersCell managers={row.managers} />
                  </td>

                  {/* Assigned Officer (B-149, parity with /admin/queue) */}
                  <td className="py-3 px-4 text-sm text-gray-700">
                    {row.assigned_admin_name ?? (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  {/* Company Setup */}
                  <td className="py-3 px-4">
                    <MiniProgressBar
                      percentage={row.sectionPcts.companySetup}
                      tooltip={`Company Setup: ${row.sectionPcts.companySetup}% complete`}
                    />
                  </td>

                  {/* Financial */}
                  <td className="py-3 px-4">
                    <MiniProgressBar
                      percentage={row.sectionPcts.financial}
                      tooltip={`Financial: ${row.sectionPcts.financial}% complete`}
                    />
                  </td>

                  {/* Banking */}
                  <td className="py-3 px-4">
                    <MiniProgressBar
                      percentage={row.sectionPcts.banking}
                      tooltip={`Banking: ${row.sectionPcts.banking}% complete`}
                    />
                  </td>

                  {/* People & KYC */}
                  <td className="py-3 px-4">
                    <MiniProgressBar
                      percentage={row.sectionPcts.peopleKyc}
                      tooltip={`People & KYC: ${row.sectionPcts.peopleKyc}% complete`}
                    />
                  </td>

                  {/* Documents */}
                  <td className="py-3 px-4">
                    <MiniProgressBar
                      percentage={row.sectionPcts.documents}
                      tooltip={`Documents: ${row.sectionPcts.documents}% complete`}
                    />
                  </td>

                  {/* Last Updated */}
                  <td className="py-3 px-4">
                    <LastUpdatedCell at={row.lastUpdatedAt} by={row.lastUpdatedBy} />
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
