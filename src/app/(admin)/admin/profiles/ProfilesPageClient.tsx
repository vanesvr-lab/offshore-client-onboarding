"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, PlusCircle, UserCheck, Building2, Users2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateProfileDialog } from "@/components/admin/CreateProfileDialog";
import type { ClientProfile, ProfileServiceRole } from "@/types";

interface Props {
  profiles: ClientProfile[];
}

type FilterType = "all" | "individual" | "organisation" | "representative";

function getTypeLabel(p: ClientProfile): string {
  if (p.is_representative) return "Representative";
  return p.record_type === "organisation" ? "Organisation" : "Individual";
}

function getTypeIcon(p: ClientProfile) {
  if (p.is_representative) return <Users2 className="h-3.5 w-3.5 text-blue-500" />;
  if (p.record_type === "organisation") return <Building2 className="h-3.5 w-3.5 text-purple-500" />;
  return <UserCheck className="h-3.5 w-3.5 text-emerald-600" />;
}

function getKycStatus(p: ClientProfile): { label: string; color: string } {
  if (p.is_representative) return { label: "N/A", color: "text-gray-400" };
  const kyc = p.client_profile_kyc as { completion_status?: string; kyc_journey_completed?: boolean } | null;
  if (!kyc) return { label: "Not started", color: "text-red-500" };
  if (kyc.kyc_journey_completed) return { label: "Complete", color: "text-green-600" };
  if (kyc.completion_status === "complete") return { label: "Complete", color: "text-green-600" };
  return { label: "Incomplete", color: "text-amber-600" };
}

function getServiceCount(p: ClientProfile): number {
  const roles = (p.profile_service_roles ?? []) as ProfileServiceRole[];
  const uniqueServices = new Set(roles.map((r) => r.service_id));
  return uniqueServices.size;
}

function getServiceNames(p: ClientProfile): string {
  const roles = (p.profile_service_roles ?? []) as ProfileServiceRole[];
  const names = new Set<string>();
  for (const r of roles) {
    const svc = r.services as { service_templates?: { name: string } | null } | null;
    const name = svc?.service_templates?.name;
    if (name) names.add(name);
  }
  return Array.from(names).join(", ") || "—";
}

function hasLogin(p: ClientProfile): boolean {
  return p.user_id != null;
}

export function ProfilesPageClient({ profiles }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = profiles.filter((p) => {
    // Type filter
    if (filter === "individual" && (p.record_type !== "individual" || p.is_representative)) return false;
    if (filter === "organisation" && p.record_type !== "organisation") return false;
    if (filter === "representative" && !p.is_representative) return false;

    // Search
    if (search) {
      const q = search.toLowerCase();
      return (
        p.full_name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">
            {profiles.length} profile{profiles.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          <PlusCircle className="h-4 w-4 mr-2" />
          New Profile
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="pl-10"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "individual", "organisation", "representative"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-full capitalize transition-colors ${
                filter === f
                  ? "bg-brand-navy text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50/50">
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Email</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">DD Level</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">KYC</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Services</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Login</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                  {search ? "No profiles match your search" : "No profiles yet"}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const kycStatus = getKycStatus(p);
                const svcCount = getServiceCount(p);
                return (
                  <tr
                    key={p.id}
                    className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/admin/profiles/${p.id}`)}
                  >
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-brand-navy hover:underline">
                        {p.full_name || "Unnamed"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {p.email ?? "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5 text-xs text-gray-600">
                        {getTypeIcon(p)}
                        {getTypeLabel(p)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-xs">
                        <Shield className="h-3 w-3 text-gray-400" />
                        {p.due_diligence_level.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-medium ${kycStatus.color}`}>
                        {kycStatus.label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-gray-600">
                        {svcCount > 0 ? `${svcCount} service${svcCount > 1 ? "s" : ""}` : "—"}
                      </span>
                      {svcCount > 0 && (
                        <span className="block text-[10px] text-gray-400 truncate max-w-[140px]">
                          {getServiceNames(p)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {hasLogin(p) ? (
                        <span className="text-xs text-green-600">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-500">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateProfileDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false);
          router.push(`/admin/profiles/${id}`);
        }}
      />
    </div>
  );
}
