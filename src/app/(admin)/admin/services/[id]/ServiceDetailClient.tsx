"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, CheckCircle, XCircle, FileText,
  UserCheck, Building2, Users2, Plus, Loader2, Send,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { ProfileServiceRole, ServiceSectionOverride, ClientProfile } from "@/types";
import type { ServiceWithTemplate, ServiceDoc } from "./page";

// ─── Extended types ──────────────────────────────────────────────────────────

type KycSnap = { completion_status: string; kyc_journey_completed: boolean };

type RoleWithProfile = ProfileServiceRole & {
  client_profiles: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_representative: boolean;
    record_type: string;
    due_diligence_level: string;
    user_id: string | null;
    client_profile_kyc: KycSnap[] | null;
  } | null;
};

type RagStatus = "green" | "amber" | "red";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcServiceDetailsRag(
  fields: ServiceField[],
  values: Record<string, unknown>,
  override?: ServiceSectionOverride,
): RagStatus {
  if (override) return override.override_status;
  const relevant = fields.filter((f) => !f.show_if);
  if (relevant.length === 0) return "green";
  const filled = relevant.filter((f) => {
    const v = values[f.key];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== "";
  });
  const required = relevant.filter((f) => f.required);
  if (required.length > 0) {
    const reqFilled = required.filter((f) => {
      const v = values[f.key];
      if (Array.isArray(v)) return v.length > 0;
      return v != null && v !== "";
    });
    if (reqFilled.length === required.length) return "green";
    if (reqFilled.length > 0 || filled.length > 0) return "amber";
    return "red";
  }
  if (filled.length === relevant.length) return "green";
  if (filled.length > 0) return "amber";
  return "red";
}

function calcDocumentsRag(docs: ServiceDoc[], override?: ServiceSectionOverride): RagStatus {
  if (override) return override.override_status;
  if (docs.length === 0) return "red";
  const hasFlagged = docs.some((d) => d.verification_status === "flagged" || d.verification_status === "rejected");
  if (hasFlagged) return "amber";
  return "green";
}

const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

const RAG_LABEL: Record<RagStatus, string> = {
  green: "Complete",
  amber: "Partial",
  red: "Action needed",
};

function RagBadge({ status }: { status: RagStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${
      status === "green" ? "text-green-700" : status === "amber" ? "text-amber-700" : "text-red-700"
    }`}>
      <span className={`inline-block h-2 w-2 rounded-full ${RAG_DOT[status]}`} />
      {RAG_LABEL[status]}
    </span>
  );
}

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-50 text-blue-700",
    submitted: "bg-indigo-50 text-indigo-700",
    in_review: "bg-amber-50 text-amber-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  rag,
  defaultOpen = true,
  children,
}: {
  title: string;
  rag: RagStatus;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors rounded-t-lg"
      >
        <span className="font-semibold text-brand-navy">{title}</span>
        <div className="flex items-center gap-3">
          <RagBadge status={rag} />
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <CardContent className="pt-0 pb-6">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Add Profile Dialog ────────────────────────────────────────────────────

function AddProfileDialog({
  serviceId,
  existingProfileIds,
  allProfiles,
  onAdded,
}: {
  serviceId: string;
  existingProfileIds: Set<string>;
  allProfiles: ClientProfile[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [role, setRole] = useState<"director" | "shareholder" | "ubo" | "other">("director");
  const [shareholdingPct, setShareholdingPct] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const available = allProfiles.filter(
    (p) => !existingProfileIds.has(p.id) &&
      (search === "" || p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.email ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_profile_id: selected.id,
          role,
          can_manage: canManage,
          shareholding_percentage: role === "shareholder" && shareholdingPct ? parseFloat(shareholdingPct) : null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`${selected.full_name} added as ${role}`);
      setOpen(false);
      setSelected(null);
      setSearch("");
      onAdded();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative" ref={dialogRef}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(!open)}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add profile
      </Button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border z-50 p-4 space-y-3">
          {!selected ? (
            <>
              <p className="text-sm font-medium text-gray-700">Select a profile</p>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {available.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2 text-center">
                    {search ? "No profiles match" : "All profiles already linked"}
                  </p>
                ) : (
                  available.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900">{p.full_name}</p>
                      {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">{selected.full_name}</p>
                <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">
                  Change
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500">Role *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "director" | "shareholder" | "ubo" | "other")}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="director">Director</option>
                  <option value="shareholder">Shareholder</option>
                  <option value="ubo">UBO</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {role === "shareholder" && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Shareholding %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={shareholdingPct}
                    onChange={(e) => setShareholdingPct(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. 25"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={canManage}
                  onChange={(e) => setCanManage(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Can manage this service</span>
              </label>
              <Button
                onClick={() => void handleAdd()}
                disabled={saving}
                className="w-full bg-brand-navy hover:bg-brand-blue"
                size="sm"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Add to service
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Person row ────────────────────────────────────────────────────────────

function PersonRow({
  roleRow,
  serviceDocs,
  serviceId,
  onRefresh,
}: {
  roleRow: RoleWithProfile;
  serviceDocs: ServiceDoc[];
  serviceId: string;
  onRefresh: () => void;
}) {
  const [togglingManage, setTogglingManage] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  if (!roleRow.client_profiles) return null;
  // non-null asserted — we checked above
  const profile = roleRow.client_profiles!;

  const kyc = Array.isArray(profile.client_profile_kyc)
    ? profile.client_profile_kyc[0] ?? null
    : null;
  const kycDone = profile.is_representative ? null : kyc?.kyc_journey_completed ?? false;
  const kycStatus: RagStatus | "na" = profile.is_representative
    ? "na"
    : kycDone
    ? "green"
    : kyc?.completion_status === "complete"
    ? "amber"
    : "red";

  const profileDocs = serviceDocs.filter((d) => d.client_profile_id === profile.id);
  const hasRejected = profileDocs.some((d) => d.verification_status === "rejected");
  const docStatus: RagStatus | "na" = profile.is_representative
    ? "na"
    : profileDocs.length === 0
    ? "red"
    : hasRejected
    ? "amber"
    : "green";

  async function toggleManage() {
    setTogglingManage(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/roles/${roleRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ can_manage: !roleRow.can_manage }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(roleRow.can_manage ? "Portal access removed" : "Portal access granted");
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setTogglingManage(false);
    }
  }

  async function sendInvite() {
    if (!profile.email) { toast.error("No email on this profile"); return; }
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Invite sent!");
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSendingInvite(false);
    }
  }

  async function removeFromService() {
    if (!confirm(`Remove ${profile.full_name} from this service?`)) return;
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/roles/${roleRow.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Removed");
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            {profile.is_representative ? (
              <Users2 className="h-3.5 w-3.5 text-blue-400" />
            ) : profile.record_type === "organisation" ? (
              <Building2 className="h-3.5 w-3.5 text-purple-400" />
            ) : (
              <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
            )}
            <Link
              href={`/admin/profiles/${profile.id}`}
              className="text-sm font-medium text-brand-navy hover:underline"
            >
              {profile.full_name}
            </Link>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-brand-navy/10 text-brand-navy">
              {roleRow.role}
            </span>
            {roleRow.shareholding_percentage != null && (
              <span className="text-[10px] text-gray-400">{roleRow.shareholding_percentage}%</span>
            )}
            {profile.is_representative && (
              <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Rep</span>
            )}
          </div>
        </div>
        <button
          onClick={() => void removeFromService()}
          className="text-xs text-gray-300 hover:text-red-500 transition-colors"
          title="Remove from service"
        >
          ×
        </button>
      </div>

      {/* KYC + Doc status row */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-gray-400">KYC:</span>
        {kycStatus === "na" ? (
          <span className="text-gray-300">n/a</span>
        ) : (
          <span className={`flex items-center gap-1 ${
            kycStatus === "green" ? "text-green-600" : kycStatus === "amber" ? "text-amber-600" : "text-red-600"
          }`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${RAG_DOT[kycStatus]}`} />
            {kycStatus === "green" ? "Done" : kycStatus === "amber" ? "Partial" : "Needed"}
          </span>
        )}
        <span className="text-gray-400">Docs:</span>
        {docStatus === "na" ? (
          <span className="text-gray-300">n/a</span>
        ) : (
          <span className={`flex items-center gap-1 ${
            docStatus === "green" ? "text-green-600" : docStatus === "amber" ? "text-amber-600" : "text-red-600"
          }`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${RAG_DOT[docStatus]}`} />
            {profileDocs.length} doc{profileDocs.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* can_manage + invite */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => void toggleManage()}
          disabled={togglingManage}
          className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 transition-colors ${
            roleRow.can_manage
              ? "bg-green-50 text-green-700 hover:bg-green-100"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {togglingManage ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : roleRow.can_manage ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          Portal access
        </button>
        {roleRow.can_manage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void sendInvite()}
            disabled={sendingInvite || !profile.email}
            className="h-7 text-xs"
          >
            {sendingInvite ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Send className="h-3 w-3 mr-1" />
            )}
            {roleRow.invite_sent_at ? "Resend" : "Send invite"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  service: ServiceWithTemplate;
  roles: ProfileServiceRole[];
  overrides: ServiceSectionOverride[];
  documents: ServiceDoc[];
  allProfiles: ClientProfile[];
}

const STATUS_OPTIONS = [
  "draft", "in_progress", "submitted", "in_review", "approved", "rejected",
] as const;

export function ServiceDetailClient({ service: initialService, roles: initialRoles, overrides, documents, allProfiles }: Props) {
  const router = useRouter();
  const [service, setService] = useState(initialService);
  const [roles] = useState(initialRoles);
  const [editingDetails, setEditingDetails] = useState(false);
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    service.service_details ?? {}
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [togglingLoe, setTogglingLoe] = useState(false);
  const [updatingMilestone, setUpdatingMilestone] = useState<string | null>(null);

  const typedRoles = roles as unknown as RoleWithProfile[];
  const serviceFields = service.service_templates?.service_fields ?? [];

  const overrideMap = new Map(overrides.map((o) => [o.section_key, o]));
  const detailsRag = calcServiceDetailsRag(serviceFields, serviceDetails, overrideMap.get("service_details"));
  const docsRag = calcDocumentsRag(documents, overrideMap.get("documents"));

  const existingProfileIds = new Set(
    typedRoles.map((r) => r.client_profiles?.id).filter(Boolean) as string[]
  );

  // KYC + doc summary counts
  const nonRepProfiles = typedRoles.filter((r) => r.client_profiles && !r.client_profiles.is_representative);
  const seenIds = new Set<string>();
  const uniqueNonRepProfiles = nonRepProfiles.filter((r) => {
    const pid = r.client_profiles!.id;
    if (seenIds.has(pid)) return false;
    seenIds.add(pid);
    return true;
  });
  const kycDoneCount = uniqueNonRepProfiles.filter((r) => {
    const kyc = Array.isArray(r.client_profiles?.client_profile_kyc)
      ? (r.client_profiles!.client_profile_kyc as KycSnap[])[0]
      : null;
    return kyc?.kyc_journey_completed === true;
  }).length;

  async function updateStatus(status: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, status: status as typeof prev.status }));
      toast.success("Status updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function toggleLoe() {
    setTogglingLoe(true);
    const next = !service.loe_received;
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loe_received: next, loe_received_at: next ? new Date().toISOString() : null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, loe_received: next, loe_received_at: next ? new Date().toISOString() : null }));
      toast.success(next ? "LOE marked received" : "LOE unmarked");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setTogglingLoe(false);
    }
  }

  async function toggleMilestone(field: "invoice_sent_at" | "payment_received_at") {
    setUpdatingMilestone(field);
    const current = service[field];
    const next = current ? null : new Date().toISOString();
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, [field]: next }));
      toast.success("Updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingMilestone(null);
    }
  }

  async function saveDetails() {
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: serviceDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, service_details: serviceDetails }));
      setEditingDetails(false);
      toast.success("Service details saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingDetails(false);
    }
  }

  function handleRolesRefresh() {
    router.refresh();
  }

  return (
    <div>
      {/* Back */}
      <Link
        href="/admin/services"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-navy mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to services
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            {service.service_templates?.name ?? "Service"}
          </h1>
          {service.service_templates?.description && (
            <p className="text-sm text-gray-500 mt-0.5">{service.service_templates.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">
            Created {new Date(service.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusBadgeClass(service.status)}`}>
            {service.status.replace(/_/g, " ")}
          </span>
          <select
            value={service.status}
            onChange={(e) => void updateStatus(e.target.value)}
            disabled={updatingStatus}
            className="h-8 rounded-lg border border-gray-200 px-2 text-xs"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-6">
        {/* LEFT: Sections */}
        <div className="col-span-2 space-y-4">
          {/* Service Details */}
          <CollapsibleSection
            title="Service Details"
            rag={detailsRag}
            defaultOpen={detailsRag !== "green"}
          >
            {serviceFields.length === 0 ? (
              <p className="text-sm text-gray-400">No service fields configured for this template.</p>
            ) : editingDetails ? (
              <div className="space-y-4">
                <DynamicServiceForm
                  fields={serviceFields}
                  values={serviceDetails}
                  onChange={(key, value) => setServiceDetails((prev) => ({ ...prev, [key]: value }))}
                />
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => void saveDetails()}
                    disabled={savingDetails}
                    className="bg-brand-navy hover:bg-brand-blue"
                  >
                    {savingDetails ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setServiceDetails(service.service_details ?? {});
                      setEditingDetails(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <DynamicServiceForm
                  fields={serviceFields}
                  values={serviceDetails}
                  onChange={() => {}}
                  readOnly
                />
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingDetails(true)}
                  >
                    Edit details
                  </Button>
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Documents */}
          <CollapsibleSection
            title={`Documents (${documents.length})`}
            rag={docsRag}
            defaultOpen={docsRag !== "green"}
          >
            {documents.length === 0 ? (
              <p className="text-sm text-gray-400">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between border rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-sm text-gray-900">{doc.file_name}</p>
                        <p className="text-[10px] text-gray-400">
                          {doc.document_types?.name ?? "Unknown type"}
                          {doc.uploaded_at && ` · ${new Date(doc.uploaded_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium capitalize ${
                      doc.verification_status === "verified" ? "text-green-600" :
                      doc.verification_status === "flagged" ? "text-amber-600" :
                      doc.verification_status === "rejected" ? "text-red-600" :
                      "text-gray-400"
                    }`}>
                      {doc.verification_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </div>

        {/* RIGHT: People + status */}
        <div className="space-y-4">
          {/* People panel */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-brand-navy">People ({typedRoles.length})</CardTitle>
                <AddProfileDialog
                  serviceId={service.id}
                  existingProfileIds={existingProfileIds}
                  allProfiles={allProfiles}
                  onAdded={handleRolesRefresh}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {typedRoles.length === 0 ? (
                <p className="text-sm text-gray-400">No profiles linked yet.</p>
              ) : (
                typedRoles.map((r) => (
                  <PersonRow
                    key={r.id}
                    roleRow={r}
                    serviceDocs={documents}
                    serviceId={service.id}
                    onRefresh={handleRolesRefresh}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Overall status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-brand-navy">Overall Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">KYC</span>
                <span className={`text-xs font-medium ${
                  kycDoneCount === uniqueNonRepProfiles.length && uniqueNonRepProfiles.length > 0
                    ? "text-green-600" : "text-amber-600"
                }`}>
                  {kycDoneCount}/{uniqueNonRepProfiles.length} complete
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Documents</span>
                <span className="text-xs text-gray-500">{documents.length} uploaded</span>
              </div>
            </CardContent>
          </Card>

          {/* LOE + Milestones */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-brand-navy">Milestones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* LOE */}
              <button
                onClick={() => void toggleLoe()}
                disabled={togglingLoe}
                className="w-full flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">LOE received</span>
                {togglingLoe ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : service.loe_received ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-300" />
                )}
              </button>

              {/* Invoice sent */}
              <button
                onClick={() => void toggleMilestone("invoice_sent_at")}
                disabled={updatingMilestone === "invoice_sent_at"}
                className="w-full flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">Invoice sent</span>
                {updatingMilestone === "invoice_sent_at" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : service.invoice_sent_at ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-300" />
                )}
              </button>

              {/* Payment received */}
              <button
                onClick={() => void toggleMilestone("payment_received_at")}
                disabled={updatingMilestone === "payment_received_at"}
                className="w-full flex items-center justify-between text-sm"
              >
                <span className="text-gray-700">Payment received</span>
                {updatingMilestone === "payment_received_at" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                ) : service.payment_received_at ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-300" />
                )}
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
