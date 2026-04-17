"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, PlusCircle, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ServiceRecord, ProfileServiceRole } from "@/types";

interface Props {
  services: ServiceRecord[];
}

type StatusFilter = "all" | "draft" | "submitted" | "in_review" | "approved" | "rejected";

const STATUS_FILTERS: StatusFilter[] = ["all", "draft", "submitted", "in_review", "approved", "rejected"];

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
    <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function getPeopleInfo(roles: ProfileServiceRole[]): { count: number; names: string[] } {
  const unique = new Map<string, string>();
  for (const r of roles) {
    const cp = r.client_profiles as { id: string; full_name: string } | null;
    if (cp) unique.set(cp.id, cp.full_name);
  }
  return { count: unique.size, names: Array.from(unique.values()) };
}

function getServiceName(svc: ServiceRecord): string {
  return svc.service_templates?.name ?? "Untitled Service";
}

export function ServicesPageClient({ services }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const filtered = services.filter((svc) => {
    if (filter !== "all" && svc.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = getServiceName(svc).toLowerCase();
      const people = getPeopleInfo(svc.profile_service_roles ?? []);
      return (
        name.includes(q) ||
        people.names.some((n) => n.toLowerCase().includes(q))
      );
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
            {services.length} service{services.length !== 1 ? "s" : ""} total
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

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by service name or person..."
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-full capitalize transition-colors ${
                filter === f
                  ? "bg-brand-navy text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "in_review" ? "In Review" : f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Service</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">People</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">LOE</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-gray-400">
                  {search || filter !== "all" ? "No services match your filters" : "No services yet"}
                </td>
              </tr>
            ) : (
              filtered.map((svc) => {
                const people = getPeopleInfo(svc.profile_service_roles ?? []);
                return (
                  <tr
                    key={svc.id}
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/admin/services/${svc.id}`)}
                  >
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-brand-navy hover:underline">
                        {getServiceName(svc)}
                      </span>
                      {svc.service_templates?.description && (
                        <p className="text-[10px] text-gray-400 truncate max-w-[250px]">
                          {svc.service_templates.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {statusBadge(svc.status)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-gray-600">
                        {people.count > 0 ? `${people.count} person${people.count > 1 ? "s" : ""}` : "—"}
                      </span>
                      {people.count > 0 && (
                        <span className="block text-[10px] text-gray-400 truncate max-w-[160px]">
                          {people.names.slice(0, 3).join(", ")}
                          {people.count > 3 ? ` +${people.count - 3}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {svc.loe_received ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-gray-300" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {new Date(svc.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
