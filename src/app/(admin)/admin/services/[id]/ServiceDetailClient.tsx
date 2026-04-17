"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, CheckCircle, XCircle, FileText,
  UserCheck, Building2, Users2, Plus, Loader2, Send,
  StickyNote, ShieldCheck, Milestone, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import { ServiceCollapsibleSection } from "@/components/admin/ServiceCollapsibleSection";
import { AuditTrail } from "@/components/admin/AuditTrail";
import {
  calcSectionCompletion,
  calcKycCompletion,
  calcDocumentsCompletion,
} from "@/lib/utils/serviceCompletion";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { ProfileServiceRole, ServiceSectionOverride, ClientProfile, DueDiligenceRequirement, DocumentType, AuditLogEntry } from "@/types";
import type { ServiceWithTemplate, ServiceDoc, AdminUser, ServiceAuditEntry } from "./page";

// ─── Section field matchers (mirrors ServiceWizard STEP_SECTION_MATCH) ────────

const SECTION_MATCHERS: Record<string, (section: string | undefined) => boolean> = {
  company_setup: (s) => !s || s === "Details" || /company\s*setup/i.test(s) || /company/i.test(s),
  financial:     (s) => !!s && /financial|finance/i.test(s),
  banking:       (s) => !!s && /bank/i.test(s),
};

function getFieldsForSection(key: string, fields: ServiceField[]): ServiceField[] {
  const matcher = SECTION_MATCHERS[key];
  if (!matcher) return [];
  return fields.filter((f) => matcher(f.section));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RagStatus = "green" | "amber" | "red";

type KycFull = {
  completion_status?: string;
  kyc_journey_completed?: boolean;
  date_of_birth?: string | null;
  nationality?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  occupation?: string | null;
  address?: string | null;
  source_of_funds_description?: string | null;
  source_of_wealth_description?: string | null;
  is_pep?: boolean | null;
  legal_issues_declared?: boolean | null;
  [key: string]: unknown;
};

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
    client_profile_kyc: KycFull[] | null;
  } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

function ragFromPct(pct: number): RagStatus {
  if (pct >= 100) return "green";
  if (pct > 0) return "amber";
  return "red";
}

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-50 text-blue-700",
    submitted: "bg-indigo-50 text-indigo-700",
    in_review: "bg-amber-50 text-amber-700",
    pending_action: "bg-orange-50 text-orange-700",
    verification: "bg-purple-50 text-purple-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

function calcKycPct(kyc: KycFull | null): number {
  if (!kyc) return 0;
  const KYC_FIELDS = [
    "date_of_birth", "nationality", "passport_number", "passport_expiry",
    "occupation", "address", "source_of_funds_description", "source_of_wealth_description",
    "is_pep", "legal_issues_declared",
  ];
  const filled = KYC_FIELDS.filter((f) => {
    const v = kyc[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return Math.round((filled / KYC_FIELDS.length) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)} className="gap-1.5">
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
                ) : available.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900">{p.full_name}</p>
                    {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">{selected.full_name}</p>
                <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">Change</button>
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
                    type="number" min="0" max="100" value={shareholdingPct}
                    onChange={(e) => setShareholdingPct(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. 25"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={canManage} onChange={(e) => setCanManage(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">Can manage this service</span>
              </label>
              <Button onClick={() => void handleAdd()} disabled={saving} className="w-full bg-brand-navy hover:bg-brand-blue" size="sm">
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

// KYC section fields for the collapsible long-form
const KYC_SECTIONS = [
  {
    title: "Identity",
    fields: [
      { key: "full_name", label: "Full legal name", type: "text" },
      { key: "aliases", label: "Aliases / other names", type: "text" },
      { key: "date_of_birth", label: "Date of birth", type: "date" },
      { key: "nationality", label: "Nationality", type: "text" },
      { key: "passport_country", label: "Passport country", type: "text" },
      { key: "passport_number", label: "Passport number", type: "text" },
      { key: "passport_expiry", label: "Passport expiry date", type: "date" },
      { key: "address", label: "Residential address", type: "textarea" },
      { key: "occupation", label: "Occupation", type: "text" },
    ],
  },
  {
    title: "Financial",
    fields: [
      { key: "source_of_funds_description", label: "Source of funds", type: "textarea" },
      { key: "source_of_wealth_description", label: "Source of wealth", type: "textarea" },
      { key: "tax_identification_number", label: "Tax identification number", type: "text" },
    ],
  },
  {
    title: "Declarations",
    fields: [
      { key: "is_pep", label: "Politically Exposed Person (PEP)", type: "boolean" },
      { key: "pep_details", label: "PEP details", type: "textarea" },
      { key: "legal_issues_declared", label: "Legal issues declared", type: "boolean" },
      { key: "legal_issues_details", label: "Legal issue details", type: "textarea" },
    ],
  },
];

function KycLongForm({ kyc, onSaved }: { kyc: KycFull; onSaved: () => void }) {
  const [fields, setFields] = useState<Record<string, unknown>>({ ...kyc });
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(KYC_SECTIONS.map(s => s.title)));

  function toggleSection(title: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  function sectionPct(section: typeof KYC_SECTIONS[number]): number {
    const filled = section.fields.filter(f => {
      const v = fields[f.key];
      return v !== null && v !== undefined && v !== "";
    }).length;
    return Math.round((filled / section.fields.length) * 100);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const kycId = kyc.id as string;
      if (!kycId) throw new Error("No KYC record ID");
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId: kycId, fields }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("KYC saved", { position: "top-right" });
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 mt-3">
      {KYC_SECTIONS.map(section => {
        const pct = sectionPct(section);
        const isOpen = openSections.has(section.title);
        return (
          <div key={section.title} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`} />
                <span className="text-sm font-medium text-brand-navy">{section.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 tabular-nums w-8">{pct}%</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {isOpen && (
              <div className="px-4 py-3 space-y-3">
                {section.fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                    {f.type === "textarea" ? (
                      <textarea
                        value={(fields[f.key] as string | null) ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        rows={2}
                        className="w-full border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue"
                      />
                    ) : f.type === "boolean" ? (
                      <select
                        value={fields[f.key] === true ? "yes" : fields[f.key] === false ? "no" : ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value === "yes" ? true : e.target.value === "no" ? false : null }))}
                        className="border rounded-lg px-3 py-2 text-sm w-full"
                      >
                        <option value="">— Select —</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : f.type === "date" ? (
                      <input
                        type="date"
                        value={(fields[f.key] as string | null) ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value || null }))}
                        className="border rounded-lg px-3 py-2 text-sm w-full"
                      />
                    ) : (
                      <input
                        type="text"
                        value={(fields[f.key] as string | null) ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="bg-brand-navy hover:bg-brand-blue">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save KYC
        </Button>
      </div>
    </div>
  );
}

function PersonCard({
  roleRow,
  combinedRoles,
  serviceId,
  onRefresh,
}: {
  roleRow: RoleWithProfile;
  combinedRoles?: string[];
  serviceId: string;
  onRefresh: () => void;
}) {
  const [togglingManage, setTogglingManage] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [showKyc, setShowKyc] = useState(false);
  if (!roleRow.client_profiles) return null;
  const profile = roleRow.client_profiles;

  const kyc = Array.isArray(profile.client_profile_kyc)
    ? profile.client_profile_kyc[0] ?? null
    : (profile.client_profile_kyc as KycFull | null);
  const kycPct = calcKycPct(kyc);
  const kycDone = kyc?.kyc_journey_completed === true;

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
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {profile.is_representative ? (
              <Users2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : profile.record_type === "organisation" ? (
              <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            ) : (
              <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            )}
            <Link
              href={`/admin/profiles/${profile.id}`}
              className="text-sm font-medium text-brand-navy hover:underline truncate"
            >
              {profile.full_name}
            </Link>
            {(combinedRoles ?? [roleRow.role]).map((r) => (
              <span key={r} className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-brand-navy/10 text-brand-navy shrink-0">
                {r}
              </span>
            ))}
            {roleRow.shareholding_percentage != null && (
              <span className="text-[10px] text-gray-400">{roleRow.shareholding_percentage}%</span>
            )}
          </div>
          {profile.email && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{profile.email}</p>
          )}
        </div>
        <button
          onClick={() => void removeFromService()}
          className="text-xs text-gray-300 hover:text-red-500 transition-colors ml-2 shrink-0"
          title="Remove from service"
        >
          ×
        </button>
      </div>

      {/* KYC progress */}
      {!profile.is_representative && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">KYC progress</span>
            <span className={kycDone ? "text-green-600 font-medium" : "text-gray-500"}>
              {kycDone ? "✓ Complete" : `${kycPct}%`}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div
              className={`h-full rounded-full ${kycDone ? "bg-green-500" : kycPct > 0 ? "bg-amber-400" : "bg-red-400"}`}
              style={{ width: `${kycPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions: Review KYC + can_manage + invite */}
      <div className="flex items-center flex-wrap gap-2">
        {!profile.is_representative && (
          <Button
            size="sm"
            variant={showKyc ? "default" : "outline"}
            onClick={() => setShowKyc(!showKyc)}
            className={`h-7 text-xs gap-1.5 ${showKyc ? "bg-brand-navy hover:bg-brand-blue" : ""}`}
          >
            {showKyc ? "Hide KYC" : "Review KYC"}
          </Button>
        )}
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
        {profile.email && (
          <Button
            size="sm" variant="outline"
            onClick={() => void sendInvite()}
            disabled={sendingInvite}
            className="h-7 text-xs"
          >
            {sendingInvite ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
            {roleRow.invite_sent_at ? "Resend invite" : "Send invite"}
          </Button>
        )}
      </div>

      {/* Inline KYC long-form (collapsible sections) */}
      {showKyc && kyc && (
        <KycLongForm
          kyc={kyc}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

// ─── Main Props ───────────────────────────────────────────────────────────────

interface Props {
  service: ServiceWithTemplate;
  roles: ProfileServiceRole[];
  overrides: ServiceSectionOverride[]; // reserved for future RAG override display
  documents: ServiceDoc[];
  allProfiles: ClientProfile[];
  adminUsers: AdminUser[];
  auditEntries: ServiceAuditEntry[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
}

const STATUS_OPTIONS = [
  "draft", "in_progress", "submitted", "in_review", "pending_action", "verification", "approved", "rejected",
] as const;

const DD_LEVELS = [
  { value: "sdd", label: "SDD — Simplified" },
  { value: "cdd", label: "CDD — Standard" },
  { value: "edd", label: "EDD — Enhanced" },
] as const;

// ─── Main Component ───────────────────────────────────────────────────────────

export function ServiceDetailClient({
  service: initialService,
  roles: initialRoles,
  overrides: _overrides, // eslint-disable-line @typescript-eslint/no-unused-vars
  documents: initialDocuments,
  allProfiles,
  adminUsers,
  auditEntries,
  requirements,
}: Props) {
  const router = useRouter();
  const [service, setService] = useState(initialService);
  const [documents] = useState(initialDocuments);
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    service.service_details ?? {}
  );
  const [pendingChanges, setPendingChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Milestones with date editing
  const [milestones, setMilestones] = useState({
    loe_received: service.loe_received ?? false,
    loe_received_at: service.loe_received_at ?? null as string | null,
    invoice_sent_at: service.invoice_sent_at ?? null as string | null,
    payment_received_at: service.payment_received_at ?? null as string | null,
  });
  const [savingMilestone, setSavingMilestone] = useState<string | null>(null);

  // Audit trail filters
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");

  const typedRoles = (initialRoles as unknown as RoleWithProfile[]);
  const serviceFields = (service.service_templates?.service_fields ?? []) as ServiceField[];

  // Deduplicate roles by profile ID — collect all roles per profile
  const profileRolesMap = new Map<string, { person: RoleWithProfile; roles: string[]; roleIds: string[] }>();
  for (const r of typedRoles) {
    const pid = r.client_profiles?.id;
    if (pid) {
      const existing = profileRolesMap.get(pid);
      if (existing) {
        if (!existing.roles.includes(r.role)) existing.roles.push(r.role);
        existing.roleIds.push(r.id);
      } else {
        profileRolesMap.set(pid, { person: r, roles: [r.role], roleIds: [r.id] });
      }
    } else {
      profileRolesMap.set(r.id, { person: r, roles: [r.role], roleIds: [r.id] });
    }
  }
  const uniqueRoles = Array.from(profileRolesMap.values());

  const existingProfileIds = new Set(
    typedRoles.map((r) => r.client_profiles?.id).filter(Boolean) as string[]
  );

  // ── Section completion ────────────────────────────────────────────────────

  const companyFields = getFieldsForSection("company_setup", serviceFields);
  const financialFields = getFieldsForSection("financial", serviceFields);
  const bankingFields = getFieldsForSection("banking", serviceFields);

  const companySetupPct = calcSectionCompletion(serviceFields, serviceDetails, "company_setup").percentage;
  const financialPct = calcSectionCompletion(serviceFields, serviceDetails, "financial").percentage;
  const bankingPct = calcSectionCompletion(serviceFields, serviceDetails, "banking").percentage;

  const hasDirector = typedRoles.some((r) => r.role === "director");
  const kycPersons = typedRoles.map((r) => ({
    client_profiles: r.client_profiles ? {
      client_profile_kyc: (Array.isArray(r.client_profiles.client_profile_kyc)
        ? r.client_profiles.client_profile_kyc[0] ?? null
        : r.client_profiles.client_profile_kyc) as Record<string, unknown> | null,
    } : null,
  }));
  const kycPct = hasDirector ? calcKycCompletion(kycPersons).percentage : 0;
  const peopleKycPct = typedRoles.length === 0 ? 0 : hasDirector ? kycPct : Math.round(kycPct * 0.5);

  const documentsPct = calcDocumentsCompletion(documents).percentage;

  // ── Field change handler ──────────────────────────────────────────────────

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setServiceDetails((prev) => ({ ...prev, [key]: value }));
    setPendingChanges(true);
  }, []);

  // ── Save / Cancel ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: serviceDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, service_details: serviceDetails }));
      setPendingChanges(false);
      toast.success("Service details saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setServiceDetails(service.service_details ?? {});
    setPendingChanges(false);
  }

  // ── Status update ─────────────────────────────────────────────────────────

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

  // ── Milestones ────────────────────────────────────────────────────────────

  async function toggleMilestone(
    field: "loe_received_at" | "invoice_sent_at" | "payment_received_at",
    boolField?: "loe_received"
  ) {
    setSavingMilestone(field);
    const current = milestones[field as keyof typeof milestones] as string | null | boolean;
    const isOn = boolField ? milestones.loe_received : !!current;
    const newDate = !isOn ? new Date().toISOString() : null;
    const patch: Record<string, unknown> = { [field]: newDate };
    if (boolField) patch[boolField] = !isOn;
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMilestones((prev) => ({
        ...prev,
        [field]: newDate,
        ...(boolField ? { [boolField]: !isOn } : {}),
      }));
      toast.success("Milestone updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingMilestone(null);
    }
  }

  async function updateMilestoneDate(
    field: "loe_received_at" | "invoice_sent_at" | "payment_received_at",
    value: string
  ) {
    setSavingMilestone(field);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value ? new Date(value).toISOString() : null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMilestones((prev) => ({ ...prev, [field]: value ? new Date(value).toISOString() : null }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingMilestone(null);
    }
  }

  // ── Assigned admin (stored in service_details._assigned_admin_id) ─────────

  const assignedAdminId = (serviceDetails._assigned_admin_id as string | null) ?? null;

  async function assignAdmin(userId: string | null) {
    const updated = { ...serviceDetails, _assigned_admin_id: userId };
    setServiceDetails(updated);
    try {
      await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: updated }),
      });
      setService((prev) => ({ ...prev, service_details: updated }));
      toast.success("Account manager updated");
    } catch {
      toast.error("Failed to update manager");
    }
  }

  // ── Audit trail filters ───────────────────────────────────────────────────

  const auditActors = Array.from(new Set(auditEntries.map((e) => e.actor_name).filter(Boolean))) as string[];
  const auditActions = Array.from(new Set(auditEntries.map((e) => e.action).filter(Boolean)));

  const filteredAudit = auditEntries.filter((e) => {
    if (auditActorFilter !== "all" && e.actor_name !== auditActorFilter) return false;
    if (auditActionFilter !== "all" && e.action !== auditActionFilter) return false;
    return true;
  });

  // Cast to AuditLogEntry[] for the AuditTrail component
  const auditForComponent = filteredAudit as unknown as AuditLogEntry[];

  function handleRolesRefresh() {
    router.refresh();
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="bg-white border rounded-xl px-5 py-4 mb-6">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {service.service_number && (
              <span className="text-xs font-mono text-gray-400 mr-2">{service.service_number}</span>
            )}
            <h1 className="text-xl font-bold text-brand-navy inline">
              {service.service_templates?.name ?? "Service"}
            </h1>
            {service.service_templates?.description && (
              <p className="text-sm text-gray-400 mt-0.5">{service.service_templates.description}</p>
            )}
          </div>

          {/* Save/Cancel */}
          {pendingChanges && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
                className="h-8 text-xs bg-brand-navy hover:bg-brand-blue"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save changes
              </Button>
            </div>
          )}
        </div>

        {/* Status + Manager row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Status:</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClass(service.status)}`}>
              {service.status.replace(/_/g, " ")}
            </span>
            <div className="relative">
              <select
                value={service.status}
                onChange={(e) => void updateStatus(e.target.value)}
                disabled={updatingStatus}
                className="h-7 rounded-lg border border-gray-200 pl-2 pr-6 text-xs appearance-none bg-white cursor-pointer"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
            </div>
            {updatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>

          {/* Divider */}
          <span className="text-gray-200">|</span>

          {/* Account Manager */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Manager:</span>
            <div className="relative">
              <select
                value={assignedAdminId ?? ""}
                onChange={(e) => void assignAdmin(e.target.value || null)}
                className="h-7 rounded-lg border border-gray-200 pl-2 pr-6 text-xs appearance-none bg-white cursor-pointer"
              >
                <option value="">— Unassigned —</option>
                {adminUsers.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    {u.full_name ?? u.email ?? u.user_id}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Workflow Progress Stepper (Salesforce chevron style) ─────── */}
      <div className="mb-6 overflow-hidden rounded-xl border">
        <div className="flex">
          {(["draft", "in_progress", "submitted", "in_review", "verification", "approved"] as const).map((step, idx, arr) => {
            const stepLabels: Record<string, string> = {
              draft: "Draft",
              in_progress: "In Progress",
              submitted: "Submitted",
              in_review: "In Review",
              verification: "Verification",
              approved: "Approved",
            };
            const stepColors: Record<string, { bg: string; text: string }> = {
              draft: { bg: "bg-slate-500", text: "text-white" },
              in_progress: { bg: "bg-blue-600", text: "text-white" },
              submitted: { bg: "bg-teal-500", text: "text-white" },
              in_review: { bg: "bg-amber-500", text: "text-white" },
              verification: { bg: "bg-orange-500", text: "text-white" },
              approved: { bg: "bg-green-600", text: "text-white" },
            };
            const stepIdx = arr.indexOf(service.status as typeof arr[number]);
            const isActive = idx === stepIdx;
            const isComplete = idx < stepIdx;
            const isFuture = idx > stepIdx;
            const isRejected = service.status === "rejected";

            const colors = isRejected && isActive
              ? { bg: "bg-red-500", text: "text-white" }
              : isComplete
              ? stepColors[step]
              : isActive
              ? stepColors[step]
              : { bg: "bg-gray-100", text: "text-gray-400" };

            return (
              <div key={step} className={`relative flex-1 ${colors.bg} ${colors.text}`}>
                <div className={`flex items-center justify-center h-12 px-4 text-xs font-semibold ${isFuture ? "opacity-60" : ""}`}>
                  {isComplete && <span className="mr-1.5">✓</span>}
                  {isRejected && isActive ? "Rejected" : stepLabels[step]}
                </div>
                {/* Chevron arrow */}
                {idx < arr.length - 1 && (
                  <div className="absolute right-0 top-0 h-full w-4 z-10" style={{ transform: "translateX(50%)" }}>
                    <svg viewBox="0 0 20 48" className="h-full w-full" preserveAspectRatio="none">
                      <path d="M0,0 L16,24 L0,48" className={`${isComplete || isActive ? "fill-current" : ""}`} style={{ fill: isComplete || isActive ? undefined : "#f3f4f6" }} />
                      <path d="M1,0 L17,24 L1,48" fill="white" opacity="0.3" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── LEFT: Main Sections (col-span-2) ────────────────────────────── */}
      <div className="lg:col-span-2 space-y-3">

        {/* ── Section 1: Company Setup ────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Company Setup"
          percentage={companySetupPct}
          ragStatus={ragFromPct(companySetupPct)}
        >
          {companyFields.length === 0 ? (
            <p className="text-sm text-gray-400 pt-4">No company setup fields for this template.</p>
          ) : (
            <div className="pt-4">
              <DynamicServiceForm
                fields={companyFields}
                values={serviceDetails}
                onChange={handleFieldChange}
              />
            </div>
          )}
        </ServiceCollapsibleSection>

        {/* ── Section 2: Financial ─────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Financial"
          percentage={financialPct}
          ragStatus={ragFromPct(financialPct)}
        >
          {financialFields.length === 0 ? (
            <p className="text-sm text-gray-400 pt-4">No financial fields for this template.</p>
          ) : (
            <div className="pt-4">
              <DynamicServiceForm
                fields={financialFields}
                values={serviceDetails}
                onChange={handleFieldChange}
              />
            </div>
          )}
        </ServiceCollapsibleSection>

        {/* ── Section 3: Banking ───────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Banking"
          percentage={bankingPct}
          ragStatus={ragFromPct(bankingPct)}
        >
          {bankingFields.length === 0 ? (
            <p className="text-sm text-gray-400 pt-4">No banking fields for this template.</p>
          ) : (
            <div className="pt-4">
              <DynamicServiceForm
                fields={bankingFields}
                values={serviceDetails}
                onChange={handleFieldChange}
              />
            </div>
          )}
        </ServiceCollapsibleSection>

        {/* ── Section 4: People & KYC ──────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title={`People & KYC (${uniqueRoles.length} ${uniqueRoles.length === 1 ? "person" : "people"})`}
          percentage={peopleKycPct}
          ragStatus={ragFromPct(peopleKycPct)}
        >
          <div className="pt-4">
            {/* Shareholding tracker */}
            {typedRoles.some((r: RoleWithProfile) => r.role === "shareholder") && (() => {
              const total = typedRoles
                .filter((r: RoleWithProfile) => r.role === "shareholder")
                .reduce((sum: number, r: RoleWithProfile) => sum + (r.shareholding_percentage ?? 0), 0);
              const ok = total >= 95 && total <= 105;
              return (
                <div className={`flex items-center gap-2 mb-4 text-sm rounded-lg px-3 py-2 ${ok ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                  <span>{ok ? "✓" : "⚠"} Shareholding: {total}%</span>
                  {!ok && <span className="text-xs">(must total 100%)</span>}
                </div>
              );
            })()}

            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-500">{uniqueRoles.length} {uniqueRoles.length === 1 ? "person" : "people"} linked</p>
              <AddProfileDialog
                serviceId={service.id}
                existingProfileIds={existingProfileIds}
                allProfiles={allProfiles}
                onAdded={handleRolesRefresh}
              />
            </div>

            {uniqueRoles.length === 0 ? (
              <p className="text-sm text-gray-400">No profiles linked yet.</p>
            ) : (
              <div className="space-y-3">
                {uniqueRoles.map(({ person, roles }) => (
                  <PersonCard
                    key={person.client_profiles?.id ?? person.id}
                    roleRow={person}
                    combinedRoles={roles}
                    serviceId={service.id}
                    onRefresh={handleRolesRefresh}
                  />
                ))}
              </div>
            )}
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 5: Documents ─────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title={`Documents (${documents.length})`}
          percentage={documentsPct}
          ragStatus={ragFromPct(documentsPct)}
        >
          <div className="pt-4">
            {documents.length === 0 ? (
              <p className="text-sm text-gray-400">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between border rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">{doc.file_name}</p>
                        <p className="text-[10px] text-gray-400">
                          {doc.document_types?.name ?? "Unknown type"}
                          {doc.uploaded_at && ` · ${new Date(doc.uploaded_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium capitalize shrink-0 ml-3 ${
                      doc.verification_status === "verified" ? "text-green-600" :
                      doc.verification_status === "flagged" ? "text-amber-600" :
                      doc.verification_status === "rejected" ? "text-red-600" :
                      "text-gray-400"
                    }`}>
                      {doc.verification_status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ServiceCollapsibleSection>

        {/* ── Admin divider ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Admin</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Section 6: Internal Notes ────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Internal Notes"
          icon={<StickyNote className="h-4 w-4" />}
          adminOnly
          defaultOpen={false}
        >
          <div className="pt-4 space-y-3">
            <p className="text-xs text-gray-400">Not visible to the client portal.</p>
            <textarea
              value={(serviceDetails._admin_notes as string | null) ?? ""}
              onChange={(e) => {
                setServiceDetails((prev) => ({ ...prev, _admin_notes: e.target.value }));
                setPendingChanges(true);
              }}
              rows={5}
              placeholder="Add internal notes about this service…"
              className="w-full border rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save notes
            </Button>
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 7: Risk Assessment ───────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Risk Assessment"
          icon={<ShieldCheck className="h-4 w-4" />}
          adminOnly
          defaultOpen={false}
        >
          <div className="pt-4 space-y-4">
            {/* DD Level */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Due Diligence Level:</span>
              <select
                value={(serviceDetails._dd_level as string | null) ?? "cdd"}
                onChange={(e) => {
                  setServiceDetails((prev) => ({ ...prev, _dd_level: e.target.value }));
                  setPendingChanges(true);
                }}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                {DD_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Completion summary */}
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Completion Summary</p>
              {[
                { label: "Company Setup", pct: companySetupPct },
                { label: "Financial", pct: financialPct },
                { label: "Banking", pct: bankingPct },
                { label: "People & KYC", pct: peopleKycPct },
                { label: "Documents", pct: documentsPct },
              ].map(({ label, pct }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-28 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragFromPct(pct)]}`} />
                </div>
              ))}
              <div className="pt-2 border-t">
                {(() => {
                  const overall = Math.round(
                    (companySetupPct + financialPct + bankingPct + peopleKycPct + documentsPct) / 5
                  );
                  const ready = overall === 100;
                  return (
                    <p className={`text-sm font-medium ${ready ? "text-green-700" : "text-amber-700"}`}>
                      {ready ? "✓ Ready for approval" : `Overall: ${overall}% — not yet ready`}
                    </p>
                  );
                })()}
              </div>
            </div>

            {/* Required docs check */}
            {requirements.filter((r) => r.requirement_type === "document").length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Required Documents</p>
                {requirements
                  .filter((r) => r.requirement_type === "document" && r.document_type_id)
                  .map((req) => {
                    const uploaded = documents.some((d) => d.document_type_id === req.document_type_id);
                    return (
                      <div key={req.id} className="flex items-center gap-2 text-sm">
                        {uploaded ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        <span className={uploaded ? "text-gray-700" : "text-gray-500"}>{req.label}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </ServiceCollapsibleSection>

      </div>{/* End left column */}

      {/* ── RIGHT: Sidebar (col-span-1) ─────────────────────────────────── */}
      <div className="space-y-3">
        {/* ── Section 8: Milestones ────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Milestones"
          icon={<Milestone className="h-4 w-4" />}
          adminOnly
          defaultOpen={true}
        >
          <div className="pt-4 space-y-4">
            {(
              [
                {
                  label: "LOE Received",
                  field: "loe_received_at" as const,
                  boolField: "loe_received" as const,
                  enabled: milestones.loe_received,
                  date: milestones.loe_received_at,
                },
                {
                  label: "Invoice Sent",
                  field: "invoice_sent_at" as const,
                  boolField: undefined,
                  enabled: !!milestones.invoice_sent_at,
                  date: milestones.invoice_sent_at,
                },
                {
                  label: "Payment Received",
                  field: "payment_received_at" as const,
                  boolField: undefined,
                  enabled: !!milestones.payment_received_at,
                  date: milestones.payment_received_at,
                },
              ] as const
            ).map((m) => (
              <div key={m.label} className="flex items-center gap-4">
                {/* Toggle */}
                <button
                  onClick={() => void toggleMilestone(m.field, m.boolField)}
                  disabled={savingMilestone === m.field}
                  className={`flex items-center gap-2 min-w-[160px] text-sm font-medium transition-colors ${
                    m.enabled ? "text-green-700" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {savingMilestone === m.field ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : m.enabled ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  )}
                  {m.label}
                </button>

                {/* Date picker (shown when enabled) */}
                {m.enabled && (
                  <input
                    type="date"
                    value={m.date ? new Date(m.date).toISOString().split("T")[0] : ""}
                    onChange={(e) => void updateMilestoneDate(m.field, e.target.value)}
                    className="border rounded-lg px-2 py-1 text-sm text-gray-700"
                  />
                )}
              </div>
            ))}
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 9: Audit Trail ───────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Audit Trail"
          icon={<Clock className="h-4 w-4" />}
          adminOnly
          defaultOpen={true}
        >
          <div className="pt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">By user:</span>
                <select
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="all">All users</option>
                  {auditActors.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Action:</span>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="all">All actions</option>
                  {auditActions.map((a) => (
                    <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              {(auditActorFilter !== "all" || auditActionFilter !== "all") && (
                <button
                  onClick={() => { setAuditActorFilter("all"); setAuditActionFilter("all"); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear filters
                </button>
              )}
            </div>

            {auditEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No audit events for this service yet.</p>
            ) : (
              <AuditTrail entries={auditForComponent} />
            )}
          </div>
        </ServiceCollapsibleSection>

      </div>{/* End right column */}
      </div>{/* End grid */}
    </div>
  );
}
