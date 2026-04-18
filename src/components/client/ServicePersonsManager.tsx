"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  UserPlus,
  User,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KycStepWizard } from "@/components/kyc/KycStepWizard";
import type { KycRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

type ServicePersonRole = "director" | "shareholder" | "ubo";

interface ServicePerson {
  id: string; // profile_service_roles.id
  role: string;
  shareholding_percentage: number | null;
  can_manage: boolean;
  client_profiles: {
    id: string;
    full_name: string;
    email: string | null;
    due_diligence_level: string;
    client_profile_kyc: Record<string, unknown> | null;
  } | null;
}

interface AvailableProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface ServicePersonsManagerProps {
  serviceId: string;
  initialPersons: ServicePerson[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
}

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

const KYC_REQUIRED_FIELDS: string[] = [
  "date_of_birth", "nationality", "passport_number", "passport_expiry",
  "occupation", "source_of_funds_description", "is_pep", "legal_issues_declared",
];

function kycPct(kyc: Record<string, unknown> | null): number {
  if (!kyc) return 0;
  const filled = KYC_REQUIRED_FIELDS.filter((f) => {
    const v = kyc[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return Math.round((filled / KYC_REQUIRED_FIELDS.length) * 100);
}

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
    work_address: (kyc.work_address as string | null) ?? null,
    work_phone: (kyc.work_phone as string | null) ?? null,
    work_email: (kyc.work_email as string | null) ?? null,
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
    sanctions_checked: (kyc.sanctions_checked as boolean) ?? false,
    sanctions_checked_at: null,
    sanctions_notes: null,
    adverse_media_checked: (kyc.adverse_media_checked as boolean) ?? false,
    adverse_media_checked_at: null,
    adverse_media_notes: null,
    pep_verified: (kyc.pep_verified as boolean) ?? false,
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
    due_diligence_level: (profile?.due_diligence_level as DueDiligenceLevel) ?? "cdd",
    completion_status: (kyc.completion_status as "incomplete" | "complete") ?? "incomplete",
    filled_by: null,
    created_at: (kyc.created_at as string) ?? "",
    updated_at: (kyc.updated_at as string) ?? "",
  };
}

function PersonCard({
  person,
  serviceId,
  requirements,
  documentTypes,
  onDelete,
}: {
  person: ServicePerson;
  serviceId: string;
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  onDelete: (roleId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showKyc, setShowKyc] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const profile = person.client_profiles;
  const kyc = profile?.client_profile_kyc ?? null;
  const pct = kycPct(kyc);
  const role = person.role as ServicePersonRole;
  const kycRecord = mapToKycRecord(person);
  const ddLevel = (profile?.due_diligence_level as DueDiligenceLevel) ?? "cdd";

  async function handleDelete() {
    if (!confirm(`Remove ${profile?.full_name ?? "this person"} from the service?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons/${person.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to remove");
      onDelete(person.id);
      toast.success("Person removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-brand-navy truncate">
              {profile?.full_name ?? "Unknown"}
            </p>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${ROLE_COLORS[role] ?? "bg-gray-100 text-gray-600"}`}>
              {ROLE_LABELS[role] ?? role}
            </span>
            {person.shareholding_percentage != null && (
              <span className="text-[10px] text-gray-500">{person.shareholding_percentage}%</span>
            )}
          </div>
          {profile?.email && <p className="text-xs text-gray-400 truncate">{profile.email}</p>}
        </div>

        {/* KYC progress bar */}
        <div className="hidden sm:block w-24 shrink-0">
          <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
            <span>KYC</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : pct > 50 ? "bg-amber-400" : "bg-red-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => { setOpen(!open); if (!open) setShowKyc(false); }}
            className="rounded p-1 hover:bg-gray-100 text-gray-400 hover:text-brand-navy transition-colors"
            title="Expand KYC"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {!person.can_manage && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
              title="Remove from service"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded KYC section */}
      {open && (
        <div className="border-t px-4 py-4 bg-gray-50/50">
          {!showKyc ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {pct === 100 ? "KYC complete" : `KYC ${pct}% complete — some fields need attention`}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowKyc(true)}
                className="text-xs"
              >
                {pct === 100 ? "Review KYC" : "Complete KYC"}
              </Button>
            </div>
          ) : (
            <div className="pt-2">
              {kycRecord.id ? (
                <KycStepWizard
                  clientId={profile?.id ?? ""}
                  kycRecord={kycRecord}
                  documents={[]}
                  documentTypes={documentTypes}
                  dueDiligenceLevel={ddLevel}
                  requirements={requirements}
                  onComplete={() => setShowKyc(false)}
                  compact={true}
                  saveUrl="/api/profiles/kyc/save"
                  inlineMode={true}
                />
              ) : (
                <p className="text-sm text-gray-400">KYC record not found. Contact your account manager.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
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

      // Build a synthetic person object to update UI without full reload
      const profile = selected === "new"
        ? { id: data.profileId ?? "", full_name: newName.trim(), email: null, due_diligence_level: "cdd", client_profile_kyc: null }
        : (() => {
            const p = (profiles ?? []).find((pr) => pr.id === selected);
            return { id: p?.id ?? "", full_name: p?.full_name ?? "", email: p?.email ?? null, due_diligence_level: "cdd", client_profile_kyc: null };
          })();

      onAdded({
        id: data.id ?? "",
        role,
        shareholding_percentage: pct ?? null,
        can_manage: false,
        client_profiles: profile,
      });
      toast.success(`${ROLE_LABELS[role]} added`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
      setLoading(false);
    }
  }

  const canConfirm = (selected !== "new" || newName.trim().length > 0) && !loading;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm z-[100]">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Add {ROLE_LABELS[role]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {loading && profiles === null ? (
            <p className="text-sm text-gray-400 py-4 text-center">Loading…</p>
          ) : (
            <>
              {(profiles ?? []).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500 font-medium mb-2">Select an existing profile</p>
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
                  selected === "new" ? "border-brand-navy bg-brand-navy/5" : "border-gray-200 hover:border-gray-300"
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
                    placeholder="As it appears on passport"
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
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {selected === "new" ? "Create & Add" : "Add to Service"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ServicePersonsManager({
  serviceId,
  initialPersons,
  requirements,
  documentTypes,
}: ServicePersonsManagerProps) {
  const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);
  const [addingRole, setAddingRole] = useState<ServicePersonRole | null>(null);

  const shareholders = persons.filter((p) => p.role === "shareholder");
  const totalShareholding = shareholders.reduce((sum, p) => sum + (p.shareholding_percentage ?? 0), 0);
  const shareholdingOk = shareholders.length === 0 || totalShareholding >= 95;

  const handleDelete = useCallback((roleId: string) => {
    setPersons((prev) => prev.filter((p) => p.id !== roleId));
  }, []);

  const handleAdded = useCallback((person: ServicePerson) => {
    setPersons((prev) => [...prev, person]);
  }, []);

  const ROLES: ServicePersonRole[] = ["director", "shareholder", "ubo"];

  return (
    <div className="space-y-6">
      {/* Add buttons */}
      <div className="flex flex-wrap gap-2">
        {ROLES.map((role) => (
          <Button
            key={role}
            size="sm"
            variant="outline"
            onClick={() => setAddingRole(role)}
            className="gap-1.5 text-sm border-dashed"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>

      {/* Shareholding tracker */}
      {shareholders.length > 0 && (
        <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${shareholdingOk ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {!shareholdingOk && <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            Shareholding: <strong>{totalShareholding}%</strong>
            {!shareholdingOk && ` — must reach 100%`}
            {shareholdingOk && " ✓"}
          </span>
        </div>
      )}

      {/* Persons list grouped by role */}
      {ROLES.map((role) => {
        const group = persons.filter((p) => p.role === role);
        if (group.length === 0) return null;
        return (
          <div key={role} className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {ROLE_LABELS[role]}s
            </p>
            {group.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                serviceId={serviceId}
                requirements={requirements}
                documentTypes={documentTypes}
                onDelete={handleDelete}
              />
            ))}
          </div>
        );
      })}

      {persons.length === 0 && (
        <p className="text-sm text-gray-400 py-2">
          No persons added yet. Add directors, shareholders, and UBOs for this service.
        </p>
      )}

      {/* Add person modal */}
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
