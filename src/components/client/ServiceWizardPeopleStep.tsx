"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { UserPlus, User, ChevronRight, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KycStepWizard } from "@/components/kyc/KycStepWizard";
import type { KycRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";
import type { ServicePerson } from "@/app/(client)/services/[id]/page";

interface AvailableProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

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
    const body: { role: string; client_profile_id?: string; full_name?: string; shareholding_percentage?: number } = { role };
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

      const profileData = selected === "new"
        ? { id: data.profileId ?? "", full_name: newName.trim(), email: null, due_diligence_level: "sdd", client_profile_kyc: null }
        : (() => {
            const p = (profiles ?? []).find((pr) => pr.id === selected);
            return { id: p?.id ?? "", full_name: p?.full_name ?? "", email: p?.email ?? null, due_diligence_level: "sdd", client_profile_kyc: null };
          })();

      onAdded({
        id: data.id ?? "",
        role,
        shareholding_percentage: pct ?? null,
        can_manage: false,
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
                    <button key={p.id} onClick={() => setSelected(p.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${selected === p.id ? "border-brand-navy bg-brand-navy/5" : "border-gray-200 hover:border-gray-300"}`}>
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
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                    <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-gray-400">or</span></div>
                  </div>
                </div>
              )}
              <button onClick={() => setSelected("new")}
                className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${selected === "new" ? "border-brand-navy bg-brand-navy/5" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <p className="text-sm font-medium text-brand-navy">Create new profile</p>
                </div>
              </button>
              {selected === "new" && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-sm">Full name <span className="text-red-400">*</span></Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="As on passport" className="text-sm" autoFocus />
                </div>
              )}
              {role === "shareholder" && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Shareholding %</Label>
                  <Input type="number" min="0" max="100" value={shareholding} onChange={(e) => setShareholding(e.target.value)} placeholder="e.g. 25" className="text-sm" />
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleConfirm} disabled={!((selected !== "new" || newName.trim().length > 0) && !loading)} className="bg-brand-navy hover:bg-brand-blue">
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

type KycFlowPerson = ServicePerson & { _kycDone?: boolean };

interface Props {
  serviceId: string;
  persons: ServicePerson[];
  onPersonsChange: (persons: ServicePerson[]) => void;
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  onNext: () => void;
}

export function ServiceWizardPeopleStep({
  serviceId,
  persons: initialPersons,
  onPersonsChange,
  requirements,
  documentTypes,
  onNext,
}: Props) {
  const [persons, setPersons] = useState<KycFlowPerson[]>(initialPersons);
  const [rosterConfirmed, setRosterConfirmed] = useState(false);
  const [kycPersonIndex, setKycPersonIndex] = useState(0);
  const [addingRole, setAddingRole] = useState<ServicePersonRole | null>(null);

  const handleAdded = useCallback((person: ServicePerson) => {
    const next = [...persons, person];
    setPersons(next);
    onPersonsChange(next);
  }, [persons, onPersonsChange]);

  const handleRemove = useCallback(async (roleId: string) => {
    if (!confirm("Remove this person from the service?")) return;
    const res = await fetch(`/api/services/${serviceId}/persons/${roleId}`, { method: "DELETE" });
    if (res.ok) {
      const next = persons.filter((p) => p.id !== roleId);
      setPersons(next);
      onPersonsChange(next);
      toast.success("Removed");
    }
  }, [persons, serviceId, onPersonsChange]);

  function markKycDone(index: number) {
    const next = [...persons];
    next[index] = { ...next[index], _kycDone: true };
    setPersons(next);
    onPersonsChange(next);
    if (index + 1 < persons.length) {
      setKycPersonIndex(index + 1);
    } else {
      onNext();
    }
  }

  // --- Roster view ---
  if (!rosterConfirmed) {
    const ROLES: ServicePersonRole[] = ["director", "shareholder", "ubo"];
    const hasDirector = persons.some((p) => p.role === "director");

    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-brand-navy mb-1">People Roster</h2>
          <p className="text-sm text-gray-500">
            Add all directors, shareholders, and UBOs for this service. Then continue to complete each person&apos;s KYC.
          </p>
        </div>

        {/* Add buttons */}
        <div className="flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <Button key={role} size="sm" variant="outline" onClick={() => setAddingRole(role)} className="gap-1.5 border-dashed">
              <UserPlus className="h-3.5 w-3.5" />
              Add {ROLE_LABELS[role]}
            </Button>
          ))}
        </div>

        {/* Person list */}
        {persons.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">No people added yet.</p>
        ) : (
          <div className="space-y-2">
            {ROLES.map((role) => {
              const group = persons.filter((p) => p.role === role);
              if (group.length === 0) return null;
              return (
                <div key={role} className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{ROLE_LABELS[role]}s</p>
                  {group.map((p) => (
                    <div key={p.id} className="flex items-center justify-between border rounded-lg px-3 py-2.5 bg-white">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-brand-navy">{p.client_profiles?.full_name ?? "Unknown"}</p>
                          {p.shareholding_percentage != null && (
                            <p className="text-xs text-gray-400">{p.shareholding_percentage}% shareholder</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[role]}`}>
                          {ROLE_LABELS[role]}
                        </span>
                        {!p.can_manage && (
                          <button onClick={() => void handleRemove(p.id)} className="text-gray-300 hover:text-red-500 transition-colors text-xs px-1.5">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {!hasDirector && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            At least one director is required before continuing.
          </p>
        )}

        <Button
          onClick={() => { setRosterConfirmed(true); setKycPersonIndex(0); }}
          disabled={!hasDirector}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          Continue to KYC <ChevronRight className="h-4 w-4 ml-1" />
        </Button>

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

  // --- KYC walkthrough ---
  if (persons.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-gray-500">No people to complete KYC for.</p>
        <Button onClick={onNext} className="bg-brand-navy hover:bg-brand-blue">Continue to Documents →</Button>
      </div>
    );
  }

  const person = persons[kycPersonIndex];
  const kycRecord = person ? mapToKycRecord(person) : null;
  const ddLevel = (person?.client_profiles?.due_diligence_level as DueDiligenceLevel) ?? "sdd";
  const profile = person?.client_profiles;

  return (
    <div className="space-y-4">
      {/* Person breadcrumb */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">
            Person {kycPersonIndex + 1} of {persons.length}
          </p>
          <h3 className="font-semibold text-brand-navy">
            {profile?.full_name ?? "Unknown"}
            {" "}
            <span className={`text-xs font-normal px-1.5 py-0.5 rounded capitalize ml-1 ${ROLE_COLORS[person.role as ServicePersonRole] ?? "bg-gray-100 text-gray-600"}`}>
              {person.role}
            </span>
          </h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-gray-500"
          onClick={() => markKycDone(kycPersonIndex)}
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip for now
        </Button>
      </div>

      {/* Mini step dots */}
      <div className="flex items-center gap-1.5">
        {persons.map((p, i) => (
          <div
            key={p.id}
            className={`h-1.5 rounded-full transition-all ${
              i < kycPersonIndex ? "w-6 bg-green-400" :
              i === kycPersonIndex ? "w-6 bg-blue-500" :
              "w-3 bg-gray-200"
            }`}
          />
        ))}
      </div>

      {kycRecord && kycRecord.id ? (
        <KycStepWizard
          clientId={profile?.id ?? ""}
          kycRecord={kycRecord}
          documents={[]}
          documentTypes={documentTypes}
          dueDiligenceLevel={ddLevel}
          requirements={requirements}
          onComplete={() => markKycDone(kycPersonIndex)}
          compact={true}
          saveUrl="/api/profiles/kyc/save"
          inlineMode={true}
        />
      ) : (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm text-gray-500">KYC record not yet created for this person.</p>
          <Button onClick={() => markKycDone(kycPersonIndex)} variant="outline">Skip for now</Button>
        </div>
      )}
    </div>
  );
}
