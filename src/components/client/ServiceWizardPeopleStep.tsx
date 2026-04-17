"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { UserPlus, User, ArrowLeft, Mail, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KycStepWizard } from "@/components/kyc/KycStepWizard";
import type { KycRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";
import type { ServicePerson } from "@/app/(client)/services/[id]/page";

// KYC fields used to compute per-person completion percentage
const KYC_PCT_FIELDS = [
  "date_of_birth", "nationality", "passport_number", "passport_expiry", "occupation", "address",
  "source_of_funds_description", "source_of_wealth_description",
  "is_pep", "legal_issues_declared", "tax_identification_number",
];

function calcKycPct(kyc: Record<string, unknown> | null): number {
  if (!kyc) return 0;
  const filled = KYC_PCT_FIELDS.filter((f) => {
    const v = kyc[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return Math.round((filled / KYC_PCT_FIELDS.length) * 100);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ServicePersonRole = "director" | "shareholder" | "ubo";

const ROLE_LABELS: Record<ServicePersonRole, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
};

const ROLE_COLORS: Record<ServicePersonRole, string> = {
  director: "bg-blue-100 text-blue-700",
  shareholder: "bg-purple-100 text-purple-700",
  ubo: "bg-amber-100 text-amber-700",
};

// ─── mapToKycRecord ───────────────────────────────────────────────────────────

function mapToKycRecord(person: ServicePerson): KycRecord {
  const kyc = person.client_profiles?.client_profile_kyc ?? {};
  const profile = person.client_profiles;
  return {
    id: (kyc.id as string) ?? "",
    client_id: "",
    profile_id: profile?.id ?? null,
    record_type: "individual",
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
    phone: null,
    address: (kyc.address as string | null) ?? null,
    aliases: (kyc.aliases as string | null) ?? null,
    work_address: null,
    work_phone: null,
    work_email: null,
    date_of_birth: (kyc.date_of_birth as string | null) ?? null,
    nationality: (kyc.nationality as string | null) ?? null,
    passport_country: (kyc.passport_country as string | null) ?? null,
    passport_number: (kyc.passport_number as string | null) ?? null,
    passport_expiry: (kyc.passport_expiry as string | null) ?? null,
    occupation: (kyc.occupation as string | null) ?? null,
    legal_issues_declared: (kyc.legal_issues_declared as boolean | null) ?? null,
    legal_issues_details: (kyc.legal_issues_details as string | null) ?? null,
    tax_identification_number: (kyc.tax_identification_number as string | null) ?? null,
    source_of_funds_description: (kyc.source_of_funds_description as string | null) ?? null,
    source_of_wealth_description: (kyc.source_of_wealth_description as string | null) ?? null,
    is_pep: (kyc.is_pep as boolean | null) ?? null,
    pep_details: (kyc.pep_details as string | null) ?? null,
    business_website: null,
    jurisdiction_incorporated: null,
    date_of_incorporation: null,
    listed_or_unlisted: null,
    jurisdiction_tax_residence: null,
    description_activity: null,
    company_registration_number: null,
    industry_sector: null,
    regulatory_licenses: null,
    sanctions_checked: false,
    sanctions_checked_at: null,
    sanctions_notes: null,
    adverse_media_checked: false,
    adverse_media_checked_at: null,
    adverse_media_notes: null,
    pep_verified: false,
    pep_verified_at: null,
    pep_verified_notes: null,
    risk_rating: null,
    risk_rating_justification: null,
    risk_rated_by: null,
    risk_rated_at: null,
    geographic_risk_assessment: null,
    relationship_history: null,
    risk_flags: null,
    senior_management_approval: null,
    senior_management_approved_by: null,
    senior_management_approved_at: null,
    ongoing_monitoring_plan: null,
    kyc_journey_completed: (kyc.kyc_journey_completed as boolean) ?? false,
    is_primary: false,
    invite_sent_at: null,
    invite_sent_by: null,
    due_diligence_level: (profile?.due_diligence_level as DueDiligenceLevel) ?? "sdd",
    completion_status: (kyc.completion_status as "incomplete" | "complete") ?? "incomplete",
    filled_by: null,
    created_at: (kyc.created_at as string) ?? "",
    updated_at: (kyc.updated_at as string) ?? "",
  };
}

// ─── AddPersonModal ───────────────────────────────────────────────────────────

interface AvailableProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

function AddPersonModal({
  serviceId,
  role,
  onClose,
  onAdded,
}: {
  serviceId: string;
  role: ServicePersonRole;
  onClose: () => void;
  onAdded: (person: ServicePerson) => void;
}) {
  const [profiles, setProfiles] = useState<AvailableProfile[] | null>(null);
  const [selected, setSelected] = useState<"new" | string>("new");
  const [newName, setNewName] = useState("");
  const [shareholding, setShareholding] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    const res = await fetch(`/api/services/${serviceId}/available-profiles`);
    const data = (await res.json()) as AvailableProfile[];
    setProfiles(data);
  }, [serviceId]);

  if (profiles === null && !loading) {
    setLoading(true);
    void fetchProfiles().then(() => setLoading(false));
  }

  async function handleConfirm() {
    const body: {
      role: string;
      client_profile_id?: string;
      full_name?: string;
      shareholding_percentage?: number;
    } = { role };
    const pct = shareholding ? parseFloat(shareholding) : undefined;
    if (pct !== undefined) body.shareholding_percentage = pct;
    if (selected === "new") {
      if (!newName.trim()) { toast.error("Name is required"); return; }
      body.full_name = newName.trim();
    } else {
      body.client_profile_id = selected;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; profileId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to add");

      const profileData =
        selected === "new"
          ? {
              id: data.profileId ?? "",
              full_name: newName.trim(),
              email: null,
              due_diligence_level: "sdd",
              client_profile_kyc: null,
            }
          : (() => {
              const p = (profiles ?? []).find((pr) => pr.id === selected);
              return {
                id: p?.id ?? "",
                full_name: p?.full_name ?? "",
                email: p?.email ?? null,
                due_diligence_level: "sdd",
                client_profile_kyc: null,
              };
            })();

      onAdded({
        id: data.id ?? "",
        role,
        shareholding_percentage: pct ?? null,
        can_manage: false,
        invite_sent_at: null,
        client_profiles: profileData,
      });
      toast.success(`${ROLE_LABELS[role]} added`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
      setLoading(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm z-[100]">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Add {ROLE_LABELS[role]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {loading && profiles === null ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : (
            <>
              {(profiles ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium mb-2">Select existing profile</p>
                  {(profiles ?? []).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        selected === p.id
                          ? "border-brand-navy bg-brand-navy/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-brand-navy">{p.full_name ?? "Unnamed"}</p>
                          {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-2 text-xs text-gray-400">or</span>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSelected("new")}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  selected === "new"
                    ? "border-brand-navy bg-brand-navy/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <p className="text-sm font-medium text-brand-navy">Create new profile</p>
                </div>
              </button>
              {selected === "new" && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-sm">
                    Full name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="As on passport"
                    className="text-sm"
                    autoFocus
                  />
                </div>
              )}
              {role === "shareholder" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Shareholding %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={shareholding}
                    onChange={(e) => setShareholding(e.target.value)}
                    placeholder="e.g. 25"
                    className="text-sm"
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!((selected !== "new" || newName.trim().length > 0) && !loading)}
                  className="bg-brand-navy hover:bg-brand-blue"
                >
                  {selected === "new" ? "Create & Add" : "Add"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── InviteDialog ─────────────────────────────────────────────────────────────

function InviteDialog({
  person,
  serviceId,
  combinedRoleLabels,
  onClose,
  onSent,
}: {
  person: ServicePerson;
  serviceId: string;
  combinedRoleLabels: string;
  onClose: () => void;
  onSent: (sentAt: string) => void;
}) {
  const [email, setEmail] = useState(person.client_profiles?.email ?? "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      toast.error("Email is required", { position: "top-right" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons/${person.id}/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), note: note.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; invite_sent_at?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      onSent(data.invite_sent_at ?? new Date().toISOString());
      toast.success("Request sent!", { position: "top-right" });
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send", { position: "top-right" });
    } finally {
      setSending(false);
    }
  }

  const personName = person.client_profiles?.full_name ?? "this person";

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm z-[100]">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Request KYC from {personName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">
            An email will be sent asking {personName} ({combinedRoleLabels}) to complete their KYC information.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm">Email address <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@email.com"
              className="text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Additional note <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a personal message..."
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button
              onClick={handleSend}
              disabled={sending || !email.trim()}
              className="bg-brand-navy hover:bg-brand-blue gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? "Sending…" : "Send Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PersonCard ───────────────────────────────────────────────────────────────

function PersonCard({
  person,
  serviceId,
  kycPct,
  onReviewKyc,
  onRemove,
  combinedRoles,
}: {
  person: ServicePerson;
  serviceId: string;
  kycPct: number;
  onReviewKyc: () => void;
  onRemove: () => void;
  combinedRoles?: ServicePersonRole[];
}) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteSentAt, setInviteSentAt] = useState<string | null>(person.invite_sent_at);

  const roles = combinedRoles ?? [person.role as ServicePersonRole];
  const combinedRoleLabels = roles.map((r) => ROLE_LABELS[r] ?? r).join(", ");

  const kycColor =
    kycPct === 100
      ? "text-green-600"
      : kycPct > 0
      ? "text-amber-600"
      : "text-red-500";

  const kycBarColor =
    kycPct === 100
      ? "bg-green-500"
      : kycPct > 0
      ? "bg-amber-500"
      : "bg-red-400";

  const sentDate = inviteSentAt
    ? new Date(inviteSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="border rounded-xl bg-white px-4 py-3.5 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-navy leading-tight">
              {person.client_profiles?.full_name ?? "Unknown"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {roles.map((r) => (
                <span
                  key={r}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[r] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {ROLE_LABELS[r] ?? r}
                </span>
              ))}
              {person.shareholding_percentage != null && (
                <span className="text-[10px] text-gray-400">{person.shareholding_percentage}%</span>
              )}
            </div>
          </div>
        </div>

        {/* Remove button — only for non-managing persons */}
        {!person.can_manage && (
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-red-500 transition-colors p-1 shrink-0"
            title="Remove from service"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* KYC status bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${kycBarColor}`}
            style={{ width: `${kycPct}%` }}
          />
        </div>
        <span className={`text-[11px] font-medium tabular-nums ${kycColor}`}>
          KYC: {kycPct}%
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={onReviewKyc}
          className="h-7 px-3 text-xs gap-1.5"
        >
          Review KYC
        </Button>

        {inviteSentAt ? (
          <span className="text-[11px] text-green-600 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Request sent {sentDate}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowInviteDialog(true)}
            className="h-7 px-3 text-xs gap-1.5 text-gray-500 hover:text-brand-navy"
          >
            <Mail className="h-3 w-3" />
            Request to fill and review KYC
          </Button>
        )}
      </div>

      {showInviteDialog && (
        <InviteDialog
          person={person}
          serviceId={serviceId}
          combinedRoleLabels={combinedRoleLabels}
          onClose={() => setShowInviteDialog(false)}
          onSent={(sentAt) => setInviteSentAt(sentAt)}
        />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  serviceId: string;
  persons: ServicePerson[];
  onPersonsChange: (persons: ServicePerson[]) => void;
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  onNavVisibilityChange: (hide: boolean) => void;
}

export function ServiceWizardPeopleStep({
  serviceId,
  persons: initialPersons,
  onPersonsChange,
  requirements,
  documentTypes,
  onNavVisibilityChange,
}: Props) {
  const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);
  const [addingRole, setAddingRole] = useState<ServicePersonRole | null>(null);
  const [reviewingRoleId, setReviewingRoleId] = useState<string | null>(null);
  // Track which persons have completed KYC in this session (to show 100% locally)
  const [kycCompletedIds, setKycCompletedIds] = useState<Set<string>>(new Set());

  // Hide/show outer wizard nav when entering/leaving KYC review
  useEffect(() => {
    onNavVisibilityChange(reviewingRoleId !== null);
  }, [reviewingRoleId, onNavVisibilityChange]);

  const handleAdded = useCallback(
    (person: ServicePerson) => {
      const next = [...persons, person];
      setPersons(next);
      onPersonsChange(next);
    },
    [persons, onPersonsChange]
  );

  const handleRemove = useCallback(
    async (roleId: string) => {
      if (!confirm("Remove this person from the service?")) return;
      const res = await fetch(`/api/services/${serviceId}/persons/${roleId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const next = persons.filter((p) => p.id !== roleId);
        setPersons(next);
        onPersonsChange(next);
        toast.success("Removed");
      }
    },
    [persons, serviceId, onPersonsChange]
  );

  const reviewingPerson = reviewingRoleId
    ? persons.find((p) => p.id === reviewingRoleId) ?? null
    : null;

  // ─── KYC Review view ──────────────────────────────────────────────────────
  if (reviewingPerson) {
    const kycRecord = mapToKycRecord(reviewingPerson);
    const ddLevel = (reviewingPerson.client_profiles?.due_diligence_level as DueDiligenceLevel) ?? "sdd";
    const roleLabel = ROLE_LABELS[reviewingPerson.role as ServicePersonRole] ?? reviewingPerson.role;
    const roleColor = ROLE_COLORS[reviewingPerson.role as ServicePersonRole] ?? "bg-gray-100 text-gray-600";

    const handleKycComplete = () => {
      // Mark this person as KYC-complete in local state
      setKycCompletedIds((prev) => {
        const next = new Set(prev);
        next.add(reviewingPerson.id);
        return next;
      });
      setReviewingRoleId(null);
    };

    return (
      <div className="space-y-4">
        {/* Back + header */}
        <div>
          <button
            onClick={() => setReviewingRoleId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-navy mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to People
          </button>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-brand-navy">
              {reviewingPerson.client_profiles?.full_name ?? "Unknown"}
            </h3>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${roleColor}`}>
              {roleLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">KYC Information</p>
        </div>

        {kycRecord.id ? (
          <KycStepWizard
            clientId={reviewingPerson.client_profiles?.id ?? ""}
            kycRecord={kycRecord}
            documents={[]}
            documentTypes={documentTypes}
            dueDiligenceLevel={ddLevel}
            requirements={requirements}
            onComplete={handleKycComplete}
            compact={true}
            saveUrl="/api/profiles/kyc/save"
            inlineMode={true}
          />
        ) : (
          <div className="text-center py-6 rounded-xl border bg-gray-50 space-y-2">
            <p className="text-sm text-gray-500">
              No KYC record found for this person.
            </p>
            <p className="text-xs text-gray-400">
              A KYC record is created automatically once the person is linked to a service. Try refreshing if this person was recently added.
            </p>
            <Button
              onClick={() => setReviewingRoleId(null)}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Back to People
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ─── Roster view ─────────────────────────────────────────────────────────
  const ROLES: ServicePersonRole[] = ["director", "shareholder", "ubo"];
  const hasDirector = persons.some((p) => p.role === "director");
  const shareholders = persons.filter((p) => p.role === "shareholder");
  const totalShares = shareholders.reduce(
    (sum, p) => sum + (p.shareholding_percentage ?? 0),
    0
  );
  const shareholdingWarning =
    shareholders.length > 0 && Math.abs(totalShares - 100) > 5;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">People & KYC</h2>
        <p className="text-sm text-gray-500">
          Add directors, shareholders, and UBOs. Click &quot;Review KYC&quot; to complete each person&apos;s compliance information.
        </p>
      </div>

      {/* Person cards — deduplicated by profile, combined roles */}
      {persons.length === 0 ? (
        <p className="text-sm text-gray-400 py-2">No people added yet.</p>
      ) : (
        <div className="space-y-2.5">
          {(() => {
            // Group by profile ID to deduplicate
            const profileMap = new Map<string, { person: ServicePerson; roles: ServicePersonRole[]; roleIds: string[] }>();
            for (const p of persons) {
              const profileId = p.client_profiles?.id ?? p.id;
              const existing = profileMap.get(profileId);
              if (existing) {
                if (!existing.roles.includes(p.role as ServicePersonRole)) {
                  existing.roles.push(p.role as ServicePersonRole);
                }
                existing.roleIds.push(p.id);
              } else {
                profileMap.set(profileId, {
                  person: p,
                  roles: [p.role as ServicePersonRole],
                  roleIds: [p.id],
                });
              }
            }
            return Array.from(profileMap.values()).map(({ person, roles, roleIds }) => {
              const rawPct = calcKycPct(person.client_profiles?.client_profile_kyc ?? null);
              const kycPct = roleIds.some((id) => kycCompletedIds.has(id)) ? 100 : rawPct;
              return (
                <PersonCard
                  key={person.client_profiles?.id ?? person.id}
                  person={person}
                  serviceId={serviceId}
                  kycPct={kycPct}
                  onReviewKyc={() => setReviewingRoleId(person.id)}
                  onRemove={() => void handleRemove(person.id)}
                  combinedRoles={roles}
                />
              );
            });
          })()}
        </div>
      )}

      {/* Shareholding tracker */}
      {shareholders.length > 0 && (
        <div
          className={`text-xs px-3 py-2 rounded-lg ${
            shareholdingWarning
              ? "bg-amber-50 text-amber-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          Shareholding: {totalShares}% of 100%
          {shareholdingWarning && " — must reach 100%"}
        </div>
      )}

      {/* Director warning */}
      {!hasDirector && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          At least one director is required.
        </p>
      )}

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map((role) => (
          <Button
            key={role}
            size="sm"
            variant="outline"
            onClick={() => setAddingRole(role)}
            className="gap-1.5 border-dashed"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>

      {addingRole && (
        <AddPersonModal
          serviceId={serviceId}
          role={addingRole}
          onClose={() => setAddingRole(null)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
