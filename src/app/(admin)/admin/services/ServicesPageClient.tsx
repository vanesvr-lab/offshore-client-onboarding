"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MiniProgressBar } from "@/components/shared/MiniProgressBar";
import type { AdminServiceRow } from "./page";

interface Props {
  rows: AdminServiceRow[];
  templateOptions: { id: string; name: string }[];
}

type StatusFilter =
  | "all"
  | "draft"
  | "in_progress"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-50 text-blue-700",
    submitted: "bg-indigo-50 text-indigo-700",
    in_review: "bg-amber-50 text-amber-700",
    pending_action: "bg-orange-50 text-orange-700",
    verification: "bg-purple-50 text-purple-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${
        styles[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {status.replace(/_/g, " ")}
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

export function ServicesPageClient({ rows, templateOptions }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");

  const filtered = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (templateFilter !== "all" && row.service_template_id !== templateFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const refMatch = row.service_number?.toLowerCase().includes(q) ?? false;
      const managerMatch = row.managers.some((m) =>
        m.full_name.toLowerCase().includes(q)
      );
      if (!refMatch && !managerMatch) return false;
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
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ref number or manager name..."
            className="pl-10"
          />
        </div>

        {/* Service type + status filters */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* Service type */}
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

          {/* Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 shrink-0">Status:</span>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  statusFilter === f.value
                    ? "bg-brand-navy text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[110px]">Ref</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[110px]">Status</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase w-[180px]">Managers</th>
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
                <td colSpan={9} className="py-12 text-center text-sm text-gray-400">
                  {search || statusFilter !== "all" || templateFilter !== "all"
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
                  {/* Ref */}
                  <td className="py-3 px-4">
                    {row.service_number ? (
                      <span className="text-sm font-semibold text-brand-navy font-mono">
                        {row.service_number}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No ref</span>
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
