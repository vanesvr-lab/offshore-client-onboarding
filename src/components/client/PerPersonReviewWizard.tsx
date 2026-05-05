"use client";

import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CheckSquare,
  Eye,
  FileText,
  Loader2,
  Square,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IdentityStep } from "@/components/kyc/steps/IdentityStep";
import { ResidentialAddressStep } from "@/components/kyc/steps/ResidentialAddressStep";
import { FinancialStep } from "@/components/kyc/steps/FinancialStep";
import { DeclarationsStep } from "@/components/kyc/steps/DeclarationsStep";
import { ReviewStep } from "@/components/kyc/steps/ReviewStep";
import { DocumentDetailDialog } from "@/components/shared/DocumentDetailDialog";
import type { DocumentDetailDoc } from "@/components/shared/DocumentDetailDialog";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";
import { DocumentStatusLegend } from "@/components/shared/DocumentStatusLegend";
import { AutosaveIndicator } from "@/components/shared/AutosaveIndicator";
import { compressIfImage } from "@/lib/imageCompression";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { DD_LEVEL_INCLUDES } from "@/lib/utils/dueDiligenceConstants";
import { computeAvailableExtracts } from "@/lib/kyc/computePrefillable";
import type {
  KycRecord,
  DocumentRecord,
  DocumentType,
  DueDiligenceLevel,
  DueDiligenceRequirement,
  VerificationStatus,
  VerificationResult,
} from "@/types";
import type { ServicePerson, ClientServiceDoc } from "@/app/(client)/services/[id]/page";

// ─── Constants ────────────────────────────────────────────────────────────────

type ServicePersonRole = "director" | "shareholder" | "ubo";

const ROLE_LABELS: Record<ServicePersonRole, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
};

// B-048 §2 — Rectangular toggle button, lightened palette so the chip reads
// as a button (rounded-md, 1px border in both states), not a badge. Per-role
// hue retained for fast scanning (Director blue / Shareholder purple / UBO
// amber), shifted to the lighter -50 / -200 / -700 shades.
const ROLE_TOGGLE_TONE: Record<ServicePersonRole, { active: string; activeHover: string }> = {
  director: {
    active: "bg-blue-50 text-blue-700 border-blue-200",
    activeHover: "hover:bg-blue-100",
  },
  shareholder: {
    active: "bg-purple-50 text-purple-700 border-purple-200",
    activeHover: "hover:bg-purple-100",
  },
  ubo: {
    active: "bg-amber-50 text-amber-700 border-amber-200",
    activeHover: "hover:bg-amber-100",
  },
};

const ROLE_INACTIVE_TONE = "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";

/**
 * B-049 §1.2 / B-055 §2.1 — Per-person doc types are derived from
 * scope='person' document_types on this template, bucketed by category.
 * After B-055 the wizard renders all categories in a single combined
 * `doc-list` sub-step at the end of the per-person flow; the in-page
 * anchors (`docs-cat-<category>`) let the persistent progress strip
 * jump between sections.
 */
const CATEGORY_LABELS: Record<string, string> = {
  identity: "Identity",
  financial: "Financial",
  compliance: "Compliance",
  additional: "Additional",
  professional: "Professional",
  tax: "Tax",
  adverse_media: "Adverse Media",
  wealth: "Wealth",
};

function categoryLabel(cat: string): string {
  return (
    CATEGORY_LABELS[cat] ??
    cat
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}

// B-055 §3.2 — short labels for the sub-step breadcrumb under the
// person name. Keep terse so the breadcrumb fits on small viewports.
const SUB_STEP_BREADCRUMB_LABELS: Record<string, string> = {
  contact: "Contact",
  "form-identity": "Identity",
  "form-residential-address": "Address",
  "form-financial": "Financial",
  "form-declarations": "Declarations",
  "doc-list": "Documents",
  "form-review": "Review",
  "form-org-details": "Company",
  "form-org-tax": "Tax",
  "form-org-review": "Review",
};

function subStepBreadcrumbLabel(kind: string): string {
  return SUB_STEP_BREADCRUMB_LABELS[kind] ?? kind;
}

// ─── Sub-step types ───────────────────────────────────────────────────────────

type SubStep =
  | { id: "doc-list"; kind: "doc-list"; label: "Documents" }
  | { id: "contact"; kind: "contact"; label: "Contact details" }
  | { id: "form-identity"; kind: "form-identity"; label: "Identity" }
  | { id: "form-residential-address"; kind: "form-residential-address"; label: "Residential Address" }
  | { id: "form-financial"; kind: "form-financial"; label: "Financial info" }
  | { id: "form-declarations"; kind: "form-declarations"; label: "Declarations" }
  | { id: "form-review"; kind: "form-review"; label: "Review" }
  | { id: "form-org-details"; kind: "form-org-details"; label: "Company details" }
  | { id: "form-org-tax"; kind: "form-org-tax"; label: "Tax & financial" }
  | { id: "form-org-review"; kind: "form-org-review"; label: "Review" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapToDocumentRecord(doc: ClientServiceDoc): DocumentRecord {
  return {
    id: doc.id,
    client_id: "",
    kyc_record_id: null,
    document_type_id: doc.document_type_id ?? "",
    file_path: "",
    file_name: doc.file_name,
    file_size: null,
    mime_type: doc.mime_type ?? null,
    verification_status: doc.verification_status as VerificationStatus,
    verification_result: doc.verification_result as VerificationResult | null,
    expiry_date: null,
    notes: null,
    is_active: true,
    uploaded_by: null,
    uploaded_at: doc.uploaded_at,
    verified_at: null,
    admin_status: doc.admin_status as "pending" | "approved" | "rejected" | null,
    admin_status_note: null,
    admin_status_by: null,
    admin_status_at: null,
  };
}

function mapToKycRecord(person: ServicePerson): KycRecord {
  const kyc = person.client_profiles?.client_profile_kyc ?? {};
  const profile = person.client_profiles;
  return {
    id: (kyc.id as string) ?? "",
    client_id: "",
    profile_id: profile?.id ?? null,
    record_type: (profile?.record_type as "individual" | "organisation" | null) ?? "individual",
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    address: (kyc.address as string | null) ?? null,
    address_line_1: (kyc.address_line_1 as string | null) ?? null,
    address_line_2: (kyc.address_line_2 as string | null) ?? null,
    address_city: (kyc.address_city as string | null) ?? null,
    address_state: (kyc.address_state as string | null) ?? null,
    address_postal_code: (kyc.address_postal_code as string | null) ?? null,
    address_country: (kyc.address_country as string | null) ?? null,
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
    employer: (kyc.employer as string | null) ?? null,
    years_in_role: (kyc.years_in_role as number | null) ?? null,
    years_total_experience: (kyc.years_total_experience as number | null) ?? null,
    industry: (kyc.industry as string | null) ?? null,
    source_of_funds_type: (kyc.source_of_funds_type as string | null) ?? null,
    source_of_funds_other: (kyc.source_of_funds_other as string | null) ?? null,
    legal_issues_declared: (kyc.legal_issues_declared as boolean | null) ?? null,
    legal_issues_details: (kyc.legal_issues_details as string | null) ?? null,
    tax_identification_number: (kyc.tax_identification_number as string | null) ?? null,
    source_of_funds_description: (kyc.source_of_funds_description as string | null) ?? null,
    source_of_wealth_description: (kyc.source_of_wealth_description as string | null) ?? null,
    is_pep: (kyc.is_pep as boolean | null) ?? null,
    pep_details: (kyc.pep_details as string | null) ?? null,
    business_website: (kyc.business_website as string | null) ?? null,
    jurisdiction_incorporated: (kyc.jurisdiction_incorporated as string | null) ?? null,
    date_of_incorporation: (kyc.date_of_incorporation as string | null) ?? null,
    listed_or_unlisted: (kyc.listed_or_unlisted as "listed" | "unlisted" | null) ?? null,
    jurisdiction_tax_residence: (kyc.jurisdiction_tax_residence as string | null) ?? null,
    description_activity: (kyc.description_activity as string | null) ?? null,
    company_registration_number: (kyc.company_registration_number as string | null) ?? null,
    industry_sector: (kyc.industry_sector as string | null) ?? null,
    regulatory_licenses: (kyc.regulatory_licenses as string | null) ?? null,
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
    due_diligence_level: (profile?.due_diligence_level as DueDiligenceLevel | null) ?? null,
    completion_status: "incomplete",
    filled_by: null,
    created_at: "",
    updated_at: "",
  };
}

// ─── RoleToggleRow ────────────────────────────────────────────────────────────

function RoleToggleRow({
  serviceId,
  profileId,
  profileName,
  profileRoleRows,
  isIndividual,
  onRoleRemoved,
  onRoleAdded,
}: {
  serviceId: string;
  profileId: string;
  profileName: string;
  profileRoleRows: ServicePerson[];
  isIndividual: boolean;
  onRoleRemoved: (roleId: string) => void;
  onRoleAdded: (person: ServicePerson) => void;
}) {
  const [pending, setPending] = useState<Set<ServicePersonRole>>(new Set());

  function rowFor(role: ServicePersonRole): ServicePerson | undefined {
    return profileRoleRows.find((r) => r.role === role);
  }

  const visibleRoles: ServicePersonRole[] = isIndividual
    ? ["director", "shareholder", "ubo"]
    : ["director", "shareholder"];

  async function toggle(role: ServicePersonRole) {
    if (pending.has(role)) return;
    const existing = rowFor(role);
    setPending((prev) => new Set(prev).add(role));
    try {
      if (existing) {
        const remainingAfter = profileRoleRows.filter((r) => r.id !== existing.id);
        if (remainingAfter.length === 0) {
          const ok = confirm(`${profileName} will have no role on this application. Continue?`);
          if (!ok) return;
        }
        onRoleRemoved(existing.id);
        const res = await fetch(`/api/services/${serviceId}/persons/${existing.id}`, { method: "DELETE" });
        if (!res.ok) {
          onRoleAdded(existing);
          toast.error(`Failed to remove ${ROLE_LABELS[role]} role`);
        }
      } else {
        const tempId = `temp-${role}-${Date.now()}`;
        const tempPerson: ServicePerson = {
          id: tempId,
          role,
          shareholding_percentage: null,
          can_manage: false,
          invite_sent_at: null,
          invite_sent_by_name: null,
          client_profiles: profileRoleRows[0]?.client_profiles ?? null,
        };
        onRoleAdded(tempPerson);
        const res = await fetch(`/api/services/${serviceId}/persons`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, client_profile_id: profileId }),
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          onRoleRemoved(tempId);
          toast.error(data.error ?? `Failed to add ${ROLE_LABELS[role]} role`);
        } else {
          onRoleRemoved(tempId);
          onRoleAdded({ ...tempPerson, id: data.id });
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(role);
        return next;
      });
    }
  }

  return (
    <div className="inline-flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-gray-600 select-none">Roles:</span>
      <div className="inline-flex items-center gap-2 flex-wrap">
        {visibleRoles.map((role) => {
          const active = !!rowFor(role);
          const tone = ROLE_TOGGLE_TONE[role];
          const busy = pending.has(role);
          return (
            <button
              key={role}
              type="button"
              role="checkbox"
              aria-checked={active}
              aria-pressed={active}
              aria-label={`Toggle ${ROLE_LABELS[role]} role`}
              onClick={() => void toggle(role)}
              disabled={busy}
              className={`inline-flex items-center gap-2 h-10 px-3 py-2 text-sm font-medium rounded-md border cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                active ? `${tone.active} ${tone.activeHover}` : ROLE_INACTIVE_TONE
              }`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : active ? (
                <CheckSquare className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Square className="h-4 w-4 text-gray-400" aria-hidden="true" />
              )}
              <span>{ROLE_LABELS[role]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline org form steps (mirrors KycStepWizard's internal versions) ────────

function OrgField({
  label,
  fieldKey,
  form,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  fieldKey: keyof KycRecord;
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium text-gray-900">
        {label}{required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
      </Label>
      {type === "textarea" ? (
        <Textarea
          value={(form[fieldKey] as string) ?? ""}
          onChange={(e) => onChange({ [fieldKey]: e.target.value } as Partial<KycRecord>)}
          placeholder={placeholder}
          rows={3}
          className="text-sm resize-none"
        />
      ) : (
        <Input
          type={type}
          value={(form[fieldKey] as string) ?? ""}
          onChange={(e) => onChange({ [fieldKey]: e.target.value } as Partial<KycRecord>)}
          placeholder={placeholder}
          className="text-sm"
        />
      )}
    </div>
  );
}

function CompanyDetailsStep({ form, onChange }: { form: Partial<KycRecord>; onChange: (f: Partial<KycRecord>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Company Details</h2>
        <p className="text-sm text-gray-600">Provide information about the company entity.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OrgField label="Company name" fieldKey="full_name" form={form} onChange={onChange} required placeholder="Legal entity name" />
        <OrgField label="Registration number" fieldKey="company_registration_number" form={form} onChange={onChange} required placeholder="Company registration number" />
        <OrgField label="Jurisdiction of incorporation" fieldKey="jurisdiction_incorporated" form={form} onChange={onChange} required placeholder="e.g. Mauritius" />
        <OrgField label="Date of incorporation" fieldKey="date_of_incorporation" form={form} onChange={onChange} type="date" required />
        <OrgField label="Industry sector" fieldKey="industry_sector" form={form} onChange={onChange} placeholder="e.g. Financial Services" />
        <div className="space-y-1">
          <Label className="text-sm">Listed or unlisted</Label>
          <select
            value={(form.listed_or_unlisted as string) ?? ""}
            onChange={(e) => onChange({ listed_or_unlisted: (e.target.value || null) as "listed" | "unlisted" | null })}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Select…</option>
            <option value="listed">Listed</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <OrgField label="Business description" fieldKey="description_activity" form={form} onChange={onChange} type="textarea" placeholder="Describe the company's main activities" />
        </div>
      </div>
    </div>
  );
}

function CorporateTaxStep({ form, onChange }: { form: Partial<KycRecord>; onChange: (f: Partial<KycRecord>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Tax / Financial</h2>
        <p className="text-sm text-gray-600">Provide tax residency and financial details.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OrgField label="Tax residency jurisdiction" fieldKey="jurisdiction_tax_residence" form={form} onChange={onChange} placeholder="e.g. Mauritius" />
        <OrgField label="Tax identification number" fieldKey="tax_identification_number" form={form} onChange={onChange} placeholder="TIN or equivalent" />
        <div className="md:col-span-2">
          <OrgField label="Regulatory licences" fieldKey="regulatory_licenses" form={form} onChange={onChange} type="textarea" placeholder="List any regulatory licences held" />
        </div>
      </div>
    </div>
  );
}

function OrgReviewStep({ form }: { form: Partial<KycRecord> }) {
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Company name", value: form.full_name },
    { label: "Registration number", value: form.company_registration_number },
    { label: "Jurisdiction of incorporation", value: form.jurisdiction_incorporated },
    { label: "Date of incorporation", value: form.date_of_incorporation },
    { label: "Industry sector", value: form.industry_sector },
    { label: "Listed / unlisted", value: form.listed_or_unlisted },
    { label: "Business description", value: form.description_activity },
    { label: "Tax residency", value: form.jurisdiction_tax_residence },
    { label: "Tax identification number", value: form.tax_identification_number },
    { label: "Regulatory licences", value: form.regulatory_licenses },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Review</h2>
        <p className="text-sm text-gray-600">Review the information below before submitting.</p>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-3 py-1.5">
            <span className="text-xs text-gray-500 w-48 shrink-0">{label}</span>
            {value ? (
              <span className="text-xs text-gray-800">{value}</span>
            ) : (
              <span className="text-xs text-red-400 italic">Not provided</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  serviceId: string;
  reviewingPerson: ServicePerson;
  /** All role rows for this profile on this service — needed for the role toggle row. */
  profileRoleRows: ServicePerson[];
  /** All docs across the service (for the in-shell progress strip). */
  documents: ClientServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  dueDiligenceLevel: DueDiligenceLevel;
  /** Called when the user finishes the wizard (last sub-step "Save & Close" / "Save & Finish"). */
  onComplete: () => void;
  /** Called when the user clicks "Back to People" — fired after pending edits are flushed. */
  onExit: () => void;
  /** Called by the in-wizard "Leave?" path when there are unsaved edits. */
  onRoleRemoved: (roleId: string) => void;
  onRoleAdded: (person: ServicePerson) => void;
  reviewAllContext?: {
    current: number;
    total: number;
    personName?: string | null;
    onAdvance: () => void;
    /** B-050 §5.2 — chip strip data. When provided, the in-shell banner is
     * replaced with a per-person chip strip + arrows. */
    chips?: {
      id: string;
      name: string;
      completionPct: number;
      isComplete: boolean;
    }[];
    /** Called when the user clicks a chip / arrow. Saves the current sub-step
     * silently first (no dialog) — see brief §5.2. */
    onJumpToPerson?: (index: number) => void;
  };
}

export function PerPersonReviewWizard({
  serviceId,
  reviewingPerson,
  profileRoleRows,
  documents: initialDocuments,
  documentTypes,
  requirements,
  dueDiligenceLevel,
  onComplete,
  onExit,
  onRoleRemoved,
  onRoleAdded,
  reviewAllContext,
}: Props) {
  const profileId = reviewingPerson.client_profiles?.id ?? "";
  const isIndividual = (reviewingPerson.client_profiles?.record_type ?? "individual") !== "organisation";
  const profileName = reviewingPerson.client_profiles?.full_name ?? "Unknown";
  const initialKycRecord = useMemo(() => mapToKycRecord(reviewingPerson), [reviewingPerson]);
  const kycRecordId = initialKycRecord.id;

  // ── Form state (synced once, then user-owned) ─────────────────────────────
  // Form state initializes from `initialKycRecord` on mount and is only
  // mutated by user edits via `handleFormChange`. Fresh server data is
  // pulled in via a key-based remount (see ServiceWizardPeopleStep where
  // <PerPersonReviewWizard> keys on kyc.updated_at) — not a sync effect.
  const [form, setForm] = useState<Partial<KycRecord>>(initialKycRecord);
  const handleFormChange = useCallback((fields: Partial<KycRecord>) => {
    setForm((prev) => ({ ...prev, ...fields }));
  }, []);

  // ── Local docs state — mutates as user uploads, drives progress strip ─────
  const [localDocs, setLocalDocs] = useState<ClientServiceDoc[]>(initialDocuments);
  useEffect(() => {
    setLocalDocs(initialDocuments);
  }, [initialDocuments]);
  const profileDocs = useMemo(
    () => localDocs.filter((d) => d.client_profile_id === profileId),
    [localDocs, profileId]
  );

  // ── Doc-type bucketing per category, gated by DD level ────────────────────
  const includedLevels = DD_LEVEL_INCLUDES[dueDiligenceLevel] ?? ["basic", "sdd", "cdd"];
  const ddReqDocTypeIds = useMemo(
    () =>
      requirements
        .filter(
          (r) =>
            r.requirement_type === "document" &&
            includedLevels.includes(r.level as "basic" | "sdd" | "cdd" | "edd") &&
            r.document_type_id
        )
        .map((r) => r.document_type_id as string),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requirements, dueDiligenceLevel]
  );
  // B-049 §1.2 — bucket per-person doc types by category, only including
  // doc types whose `scope` is 'person'. The set of categories is dynamic so
  // adding a new category in admin / seed data automatically grows the list
  // of sub-steps. Order is preserved to keep a predictable wizard sequence.
  const PERSON_CATEGORY_ORDER = [
    "identity",
    "financial",
    "compliance",
    "professional",
    "tax",
    "adverse_media",
    "wealth",
    "additional",
  ] as const;

  const docTypesByCategory = useMemo(() => {
    const eligible = ddReqDocTypeIds.length > 0
      ? documentTypes.filter((dt) => ddReqDocTypeIds.includes(dt.id))
      : documentTypes;
    const personOnly = eligible.filter((dt) => (dt.scope ?? "person") === "person");
    const out: Record<string, DocumentType[]> = {};
    for (const dt of personOnly) {
      const cat = (dt.category || "additional") as string;
      if (!out[cat]) out[cat] = [];
      out[cat].push(dt);
    }
    return out;
  }, [documentTypes, ddReqDocTypeIds]);

  const personCategories = useMemo<string[]>(() => {
    const present = Object.keys(docTypesByCategory).filter((c) => docTypesByCategory[c].length > 0);
    const ordered = PERSON_CATEGORY_ORDER.filter((c) => present.includes(c));
    const extras = present.filter((c) => !PERSON_CATEGORY_ORDER.includes(c as typeof PERSON_CATEGORY_ORDER[number]));
    return [...ordered, ...extras];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTypesByCategory]);

  function getUploaded(dtId: string): ClientServiceDoc | undefined {
    return profileDocs.find((d) => d.document_type_id === dtId);
  }

  function uploadedCountFor(cat: string): number {
    return (docTypesByCategory[cat] ?? []).filter((dt) => !!getUploaded(dt.id)).length;
  }

  const totalUploaded = personCategories.reduce((acc, c) => acc + uploadedCountFor(c), 0);
  const totalDocsRequired = personCategories.reduce(
    (acc, c) => acc + (docTypesByCategory[c]?.length ?? 0),
    0
  );

  // ── Sub-step computation ──────────────────────────────────────────────────
  const isCdd = !isIndividual ? false : dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd";

  // B-055 §2.1 — Forms first, single combined doc-list at the end. The
  // doc-list step is omitted if the template has no person-scope doc
  // requirements (e.g. organisation roles where everything is captured
  // in form fields). Order:
  //   individual: contact → identity → address → financial →
  //               declarations (CDD/EDD) → docs → review
  //   organisation: contact → company details → tax → docs → review
  const hasPersonDocs = personCategories.length > 0;
  const subSteps: SubStep[] = useMemo(() => {
    const out: SubStep[] = [];
    out.push({ id: "contact", kind: "contact", label: "Contact details" });
    if (isIndividual) {
      out.push({ id: "form-identity", kind: "form-identity", label: "Identity" });
      out.push({ id: "form-residential-address", kind: "form-residential-address", label: "Residential Address" });
      out.push({ id: "form-financial", kind: "form-financial", label: "Financial info" });
      if (isCdd) out.push({ id: "form-declarations", kind: "form-declarations", label: "Declarations" });
      if (hasPersonDocs) out.push({ id: "doc-list", kind: "doc-list", label: "Documents" });
      out.push({ id: "form-review", kind: "form-review", label: "Review" });
    } else {
      out.push({ id: "form-org-details", kind: "form-org-details", label: "Company details" });
      out.push({ id: "form-org-tax", kind: "form-org-tax", label: "Tax & financial" });
      if (hasPersonDocs) out.push({ id: "doc-list", kind: "doc-list", label: "Documents" });
      out.push({ id: "form-org-review", kind: "form-org-review", label: "Review" });
    }
    return out;
  }, [isIndividual, isCdd, hasPersonDocs]);

  const [subStepIndex, setSubStepIndex] = useState(0);
  // Snap back to a valid sub-step if the visible list shrinks (e.g. role flip on org).
  useEffect(() => {
    if (subStepIndex > subSteps.length - 1) setSubStepIndex(Math.max(0, subSteps.length - 1));
  }, [subSteps.length, subStepIndex]);

  // B-058 §2.2 — when the user clicks a category badge from a non-docs
  // sub-step, stash the target category and navigate to docs; the effect
  // below scrolls to the anchor once that step has rendered.
  const [pendingDocsCategory, setPendingDocsCategory] = useState<string | null>(null);

  const currentSubStep = subSteps[subStepIndex] ?? subSteps[0];
  const isLastSubStep = subStepIndex === subSteps.length - 1;
  const isFirstSubStep = subStepIndex === 0;
  // B-055 §3.3 — index of the per-person review sub-step ("form-review"
  // for individuals, "form-org-review" for organisations). Used by the
  // "Review <name>" shortcut in the wizard header.
  const reviewSubStepIndex = subSteps.findIndex(
    (s) => s.kind === "form-review" || s.kind === "form-org-review"
  );
  // B-058 §2 — index of the combined doc-list sub-step. Used by the
  // category-badge buttons to navigate to the docs step from any other
  // sub-step before scrolling to the category anchor.
  const docsSubStepIndex = subSteps.findIndex((s) => s.kind === "doc-list");

  // B-058 §2.2 — once the doc-list sub-step has mounted, scroll to the
  // pending category anchor (set by a badge click from another sub-step).
  useEffect(() => {
    if (currentSubStep.kind === "doc-list" && pendingDocsCategory) {
      const id = `docs-cat-${pendingDocsCategory}`;
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingDocsCategory(null);
      });
    }
  }, [currentSubStep.kind, pendingDocsCategory]);

  // ── Save helpers ──────────────────────────────────────────────────────────
  const autosave = useAutosave();
  const saving = autosave.state === "saving" || autosave.state === "retrying";
  const formRef = useRef(form);
  formRef.current = form;
  const saveKycForm = useCallback(async (): Promise<boolean> => {
    if (!kycRecordId) return true; // no record yet — nothing to save server-side
    return autosave.save(async () => {
      try {
        const res = await fetch("/api/profiles/kyc/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kycRecordId, fields: formRef.current }),
        });
        if (!res.ok) return false;
        return true;
      } catch {
        return false;
      }
    });
  }, [kycRecordId, autosave]);

  // ── Doc upload handler (mirrors KycDocListPanel) ──────────────────────────
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const [pendingUploadTypeId, setPendingUploadTypeId] = useState<string | null>(null);
  const [detailDoc, setDetailDoc] = useState<DocumentDetailDoc | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ── B-055 §4 — Smart pre-fill from passport / POA OCR ─────────────────────
  // The user can optionally upload their passport on the Identity sub-step
  // or their proof of address on the Address sub-step. The upload runs the
  // normal verification pipeline AND auto-fills the form fields below from
  // `verification_result.extracted_fields` so users don't re-type what's
  // already on the document.
  type PrefillKind = "passport" | "poa";
  const PREFILL_DOC_NAMES: Record<PrefillKind, string> = {
    passport: "Certified Passport Copy",
    poa: "Proof of Residential Address",
  };
  const [prefillUploadingKind, setPrefillUploadingKind] = useState<PrefillKind | null>(null);
  const prefillInputRef = useRef<HTMLInputElement>(null);
  const pendingPrefillKindRef = useRef<PrefillKind | null>(null);

  function resolvePrefillDocType(kind: PrefillKind): DocumentType | undefined {
    const name = PREFILL_DOC_NAMES[kind];
    // Match the IdentityStep convention: requirement-first lookup, then a
    // bare documentTypes name fallback so manually-seeded templates still
    // work.
    const fromReq = requirements.find(
      (r) => r.requirement_type === "document" && r.document_types?.name === name
    )?.document_type_id;
    if (fromReq) {
      const dt = documentTypes.find((d) => d.id === fromReq);
      if (dt) return dt;
    }
    return documentTypes.find((dt) => dt.name === name);
  }

  async function pollForVerification(docId: string, dtId: string) {
    const MAX_ATTEMPTS = 25;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/documents/${docId}`);
        if (!res.ok) continue;
        const data = (await res.json()) as { document?: ClientServiceDoc };
        if (data.document && data.document.verification_status !== "pending") {
          setLocalDocs((prev) => {
            const without = prev.filter((d) => !(d.document_type_id === dtId && d.client_profile_id === profileId));
            return [...without, data.document as ClientServiceDoc];
          });
          return;
        }
      } catch {
        // swallow
      }
    }
  }

  async function handleUpload(dtId: string, file: File) {
    setUploadingTypeId(dtId);
    let uploadFile = file;
    if (file.type.startsWith("image/") && file.size > 500 * 1024) {
      const t = toast.loading("Optimising image…", { position: "top-right" });
      try { uploadFile = await compressIfImage(file); } finally { toast.dismiss(t); }
    }
    const VERCEL_LIMIT = 4.5 * 1024 * 1024;
    if (uploadFile.size > VERCEL_LIMIT) {
      toast.error(`File is too large (${(uploadFile.size / 1024 / 1024).toFixed(1)} MB). Please upload under 4.5 MB.`);
      setUploadingTypeId(null);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("documentTypeId", dtId);
      fd.append("clientProfileId", profileId);
      const res = await fetch(`/api/services/${serviceId}/documents/upload`, { method: "POST", body: fd });
      const raw = await res.text();
      let data: { document?: ClientServiceDoc; error?: string } = {};
      try { data = raw ? (JSON.parse(raw) as typeof data) : {}; } catch { /* */ }
      if (!res.ok) {
        if (res.status === 413) throw new Error("File is too large. Please upload under 4.5 MB.");
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      if (data.document) {
        const newDoc = data.document as ClientServiceDoc;
        setLocalDocs((prev) => {
          const without = prev.filter((d) => !(d.document_type_id === dtId && d.client_profile_id === profileId));
          return [...without, newDoc];
        });
        toast.success("Document uploaded — AI verification running...", { position: "top-right" });
        void pollForVerification(newDoc.id, dtId);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingTypeId(null);
    }
  }

  async function handlePrefillUpload(kind: PrefillKind, file: File) {
    const docType = resolvePrefillDocType(kind);
    if (!docType) {
      toast.error(
        `Couldn't find a ${kind === "passport" ? "passport" : "proof of address"} document type for this template.`
      );
      return;
    }

    setPrefillUploadingKind(kind);
    let uploadFile = file;
    if (file.type.startsWith("image/") && file.size > 500 * 1024) {
      const t = toast.loading("Optimising image…", { position: "top-right" });
      try { uploadFile = await compressIfImage(file); } finally { toast.dismiss(t); }
    }
    const VERCEL_LIMIT = 4.5 * 1024 * 1024;
    if (uploadFile.size > VERCEL_LIMIT) {
      toast.error(`File is too large (${(uploadFile.size / 1024 / 1024).toFixed(1)} MB). Please upload under 4.5 MB.`);
      setPrefillUploadingKind(null);
      return;
    }

    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("documentTypeId", docType.id);
      fd.append("clientProfileId", profileId);
      const res = await fetch(`/api/services/${serviceId}/documents/upload`, { method: "POST", body: fd });
      const raw = await res.text();
      let data: { document?: ClientServiceDoc; error?: string } = {};
      try { data = raw ? (JSON.parse(raw) as typeof data) : {}; } catch { /* */ }
      if (!res.ok || !data.document) {
        if (res.status === 413) throw new Error("File is too large. Please upload under 4.5 MB.");
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }

      const newDoc = data.document;
      setLocalDocs((prev) => {
        const without = prev.filter(
          (d) => !(d.document_type_id === docType.id && d.client_profile_id === profileId)
        );
        return [...without, newDoc];
      });

      toast.success(
        kind === "passport"
          ? "Reading your passport — fields will auto-fill in a moment."
          : "Reading your proof of address — fields will auto-fill in a moment.",
        { position: "top-right" }
      );

      // Poll for AI verification — same cadence as pollForVerification.
      let verifiedDoc: ClientServiceDoc | null = null;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const r = await fetch(`/api/documents/${newDoc.id}`);
          if (!r.ok) continue;
          const j = (await r.json()) as { document?: ClientServiceDoc };
          if (j.document && j.document.verification_status !== "pending") {
            verifiedDoc = j.document;
            const fresh = j.document;
            setLocalDocs((prev) => {
              const without = prev.filter((d) => d.id !== fresh.id);
              return [...without, fresh];
            });
            break;
          }
        } catch { /* swallow */ }
      }

      if (!verifiedDoc) {
        toast.error("Verification is taking longer than expected. You can keep filling the form — values will appear once it's done.");
        return;
      }

      const rows = computeAvailableExtracts({
        docs: [{
          id: verifiedDoc.id,
          document_type_id: verifiedDoc.document_type_id,
          uploaded_at: verifiedDoc.uploaded_at,
          verification_result: verifiedDoc.verification_result as { extracted_fields?: Record<string, unknown> | null } | null,
        }],
        docTypes: [{
          id: docType.id,
          name: docType.name,
          ai_extraction_fields: docType.ai_extraction_fields ?? null,
        }],
      });

      if (rows.length === 0) {
        toast.error(
          kind === "passport"
            ? "Couldn't read your passport — please type the fields manually."
            : "Couldn't read your proof of address — please type the fields manually."
        );
        return;
      }

      const patch: Record<string, string> = {};
      for (const row of rows) patch[row.target] = row.value;

      // Persist before mutating local form state so a refresh doesn't lose the values.
      if (kycRecordId) {
        try {
          await fetch("/api/profiles/kyc/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kycRecordId, fields: patch }),
          });
        } catch { /* best-effort — local form state still updates */ }
      }

      // B-057 — the inner step (IdentityStep / ResidentialAddressStep)
      // owns the "prefill succeeded" feedback now (its own banner reacts
      // to the new doc id). No top-right toast here so we don't render
      // duplicate success messaging at the same time as the inline
      // banner.
      handleFormChange(patch as Partial<KycRecord>);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPrefillUploadingKind(null);
    }
  }

  // ── Deferred AI verification ──────────────────────────────────────────────
  // B-049 §3.2 — context-dependent doc types (CV, source-of-funds evidence,
  // bank reference, employer letter, adverse media) skip AI on upload. Once
  // the wizard collects the cross-form context (name, occupation, employer,
  // declared sources, …) we re-trigger AI on every still-pending matching
  // doc. Fired after the form-financial sub-step (professional details +
  // source of funds) and after form-declarations (source of wealth).
  const docTypesById = useMemo(() => {
    const m = new Map<string, DocumentType>();
    for (const dt of documentTypes) m.set(dt.id, dt);
    return m;
  }, [documentTypes]);

  async function triggerDeferredVerifications() {
    const pending = profileDocs.filter((d) => {
      if (d.verification_status !== "pending") return false;
      const dt = d.document_type_id ? docTypesById.get(d.document_type_id) : null;
      return dt?.ai_deferred === true;
    });
    if (pending.length === 0) return;
    // Fire all in parallel; on completion, refresh local doc state from the
    // server so the UI reflects the new verification_status.
    const results = await Promise.allSettled(
      pending.map((d) =>
        fetch(`/api/documents/${d.id}/verify-with-context`, { method: "POST" })
      )
    );
    // Best-effort refresh of any docs that got a 200 — pull the document row
    // and patch local state. Errors are silent here; AI failures fall back to
    // 'manual_review' on the server side.
    for (let i = 0; i < pending.length; i++) {
      const r = results[i];
      if (r.status !== "fulfilled" || !r.value.ok) continue;
      try {
        const fresh = await fetch(`/api/documents/${pending[i].id}`);
        if (!fresh.ok) continue;
        const data = (await fresh.json()) as { document?: ClientServiceDoc };
        if (!data.document) continue;
        setLocalDocs((prev) => {
          const without = prev.filter((d) => d.id !== pending[i].id);
          return [...without, data.document as ClientServiceDoc];
        });
      } catch {
        // ignore
      }
    }
  }

  // ── Sub-step transitions ──────────────────────────────────────────────────
  async function goNext() {
    // Save form data on form sub-steps before advancing
    if (currentSubStep.kind.startsWith("form-")) {
      const ok = await saveKycForm();
      if (!ok) return;
    }
    // Re-run deferred AI verifications once cross-form context is in place.
    if (
      currentSubStep.kind === "form-financial" ||
      currentSubStep.kind === "form-declarations"
    ) {
      void triggerDeferredVerifications();
    }
    if (isLastSubStep) {
      // Either single-mode "Save & Close" or review-all "Save & Finish"
      onComplete();
      return;
    }
    setSubStepIndex((i) => i + 1);
  }

  async function goNextWithMiddle() {
    // The middle button on form sub-steps is "Save & Close" → save + exit
    // (or "Save & Continue / Save & Finish" in review-all mode on the LAST sub-step)
    if (currentSubStep.kind.startsWith("form-")) {
      const ok = await saveKycForm();
      if (!ok) return;
    }
    if (
      currentSubStep.kind === "form-financial" ||
      currentSubStep.kind === "form-declarations"
    ) {
      void triggerDeferredVerifications();
    }
    if (reviewAllContext && isLastSubStep) {
      // Review-all final sub-step: advance the walk OR finish.
      if (reviewAllContext.current + 1 < reviewAllContext.total) {
        reviewAllContext.onAdvance();
      } else {
        onComplete();
      }
      return;
    }
    // Single-mode "Save & Close" or doc-list "Upload later"
    if (currentSubStep.kind === "doc-list") {
      // Upload later — advance only this sub-step.
      setSubStepIndex((i) => i + 1);
    } else {
      onComplete();
    }
  }

  async function goBack() {
    if (currentSubStep.kind.startsWith("form-")) {
      const ok = await saveKycForm();
      if (!ok) return;
    }
    if (isFirstSubStep) {
      onExit();
      return;
    }
    setSubStepIndex((i) => i - 1);
  }

  async function handleBackLinkClick() {
    if (currentSubStep.kind.startsWith("form-")) {
      const ok = await saveKycForm();
      if (!ok) {
        toast.error("Couldn't save — check your connection and try again before leaving.");
        return;
      }
    }
    onExit();
  }

  // ── Doc sub-step gating (Next disabled until all docs uploaded) ───────────
  function isDocCategoryComplete(cat: string): boolean {
    return (docTypesByCategory[cat] ?? []).every((dt) => !!getUploaded(dt.id));
  }
  // B-055 §2.1 — single combined doc-list step. Next is disabled until every
  // category is fully uploaded; the user can still skip via the explicit
  // "Upload later" middle button.
  const allDocsComplete = personCategories.every((c) => isDocCategoryComplete(c));
  const docNextDisabled = currentSubStep.kind === "doc-list" ? !allDocsComplete : false;

  // ── Sub-step content render ───────────────────────────────────────────────
  function renderDocCategoryContent(cat: string) {
    const items = docTypesByCategory[cat] ?? [];
    return (
      <div className="border rounded-xl bg-white">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold text-brand-navy uppercase tracking-wide">
            {categoryLabel(cat)} Documents
          </p>
          <span className={`text-xs font-medium ${
            isDocCategoryComplete(cat) ? "text-green-600" : "text-amber-600"
          }`}>
            {uploadedCountFor(cat)} of {items.length} uploaded
          </span>
        </div>
        <div className="divide-y">
          {items.map((dt) => {
            const uploaded = getUploaded(dt.id);
            const isUploading = uploadingTypeId === dt.id;
            const aiStatus = uploaded?.verification_status;
            const adminStatus = uploaded?.admin_status;
            const isApproved = !!(uploaded && adminStatus === "approved");
            return (
              <div key={dt.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {!uploaded && <FileText className="h-4 w-4 text-amber-500 shrink-0" />}
                  {uploaded && !isApproved && <FileText className="h-4 w-4 text-gray-500 shrink-0" />}
                  {isApproved && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                  <span className={`text-sm truncate ${
                    !uploaded ? "text-amber-700"
                    : isApproved ? "text-green-700 font-medium"
                    : "text-gray-700"
                  }`}>
                    {dt.name}
                  </span>
                  {uploaded && (
                    <DocumentStatusBadge
                      aiStatus={aiStatus}
                      adminStatus={adminStatus}
                      compact
                      className="shrink-0"
                    />
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  {uploaded ? (
                    <>
                      <span className="text-sm text-green-700 font-medium hidden sm:inline">Uploaded</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 px-3 text-sm gap-1.5 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
                        onClick={() => setDetailDoc({
                          id: uploaded.id,
                          file_name: uploaded.file_name,
                          mime_type: uploaded.mime_type,
                          uploaded_at: uploaded.uploaded_at,
                          document_type_id: uploaded.document_type_id,
                          verification_status: uploaded.verification_status,
                          verification_result: uploaded.verification_result,
                          admin_status: uploaded.admin_status,
                          document_types: uploaded.document_types,
                        })}
                        title="View document"
                        aria-label="View document"
                      >
                        <Eye className="h-4 w-4 text-gray-600" />
                        View
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="h-10 px-4 py-2 text-sm font-medium gap-2 rounded-md bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 shadow-none"
                      disabled={isUploading}
                      onClick={() => {
                        setPendingUploadTypeId(dt.id);
                        uploadInputRef.current?.click();
                      }}
                    >
                      {isUploading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <><Upload className="h-4 w-4" />Upload</>
                      }
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderContactContent() {
    return (
      <div className="space-y-3">
        {/* B-055 §2.3 — explicit "this is optional" banner so users feel
            comfortable skipping ahead. Next is never disabled here. */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3">
          <p className="text-sm text-brand-navy">
            <span className="font-semibold">Contact details are optional.</span>{" "}
            You can fill these now or skip and come back later.
          </p>
        </div>
        <ContactDetailsSubStep
          profileId={profileId}
          initialEmail={reviewingPerson.client_profiles?.email ?? null}
          initialPhone={reviewingPerson.client_profiles?.phone ?? null}
        />
      </div>
    );
  }

  // B-055 §2.1 / §2.2 — render every category vertically stacked, each
  // wrapped in an anchor div the persistent strip can scroll to.
  function renderAllDocsContent() {
    return (
      <div className="space-y-4">
        {personCategories.map((cat) => (
          <div key={cat} id={`docs-cat-${cat}`} className="scroll-mt-4">
            {renderDocCategoryContent(cat)}
          </div>
        ))}
      </div>
    );
  }

  const personDocsAsRecords = useMemo(
    () => profileDocs.map(mapToDocumentRecord),
    [profileDocs]
  );

  function renderFormContent() {
    switch (currentSubStep.kind) {
      case "form-identity":
        return (
          <div className="space-y-4">
            <PrefillUploadCard
              kind="passport"
              docType={resolvePrefillDocType("passport")}
              uploaded={!!getUploaded(resolvePrefillDocType("passport")?.id ?? "")}
              uploading={prefillUploadingKind === "passport"}
              onTrigger={() => {
                pendingPrefillKindRef.current = "passport";
                prefillInputRef.current?.click();
              }}
            />
            <IdentityStep
              clientId={profileId}
              kycRecord={initialKycRecord}
              documents={personDocsAsRecords}
              documentTypes={documentTypes}
              requirements={requirements}
              form={form}
              onChange={handleFormChange}
              onDocumentUploaded={() => { /* docs uploaded inside form steps are unused here */ }}
              showContactFields={false}
              hideDocumentUploads={true}
              hideAddressFields={true}
              showErrorsImmediately
              personDocs={personDocsAsRecords}
              personDocTypes={documentTypes}
              kycRecordId={kycRecordId}
            />
          </div>
        );
      case "form-residential-address":
        return (
          <div className="space-y-4">
            <PrefillUploadCard
              kind="poa"
              docType={resolvePrefillDocType("poa")}
              uploaded={!!getUploaded(resolvePrefillDocType("poa")?.id ?? "")}
              uploading={prefillUploadingKind === "poa"}
              onTrigger={() => {
                pendingPrefillKindRef.current = "poa";
                prefillInputRef.current?.click();
              }}
            />
            <ResidentialAddressStep
              clientId={profileId}
              kycRecord={initialKycRecord}
              documents={personDocsAsRecords}
              documentTypes={documentTypes}
              requirements={requirements}
              form={form}
              onChange={handleFormChange}
              showErrorsImmediately
              personDocs={personDocsAsRecords}
              personDocTypes={documentTypes}
              kycRecordId={kycRecordId}
            />
          </div>
        );
      case "form-financial":
        return (
          <FinancialStep
            clientId={profileId}
            kycRecord={initialKycRecord}
            documents={personDocsAsRecords}
            documentTypes={documentTypes}
            dueDiligenceLevel={dueDiligenceLevel}
            requirements={requirements}
            form={form}
            onChange={handleFormChange}
            onDocumentUploaded={() => {}}
            hideDocumentUploads={true}
            showErrorsImmediately
          />
        );
      case "form-declarations":
        return (
          <DeclarationsStep
            clientId={profileId}
            kycRecord={initialKycRecord}
            documents={personDocsAsRecords}
            documentTypes={documentTypes}
            dueDiligenceLevel={dueDiligenceLevel}
            requirements={requirements}
            form={form}
            onChange={handleFormChange}
            onDocumentUploaded={() => {}}
            hideDocumentUploads={true}
            showErrorsImmediately
          />
        );
      case "form-review":
        return (
          <ReviewStep
            kycRecord={initialKycRecord}
            documents={personDocsAsRecords}
            documentTypes={documentTypes}
            dueDiligenceLevel={dueDiligenceLevel}
            requirements={requirements}
            form={form}
            onJumpTo={(target) => {
              // B-055 §2.1 — single combined doc-list. Match by kind and,
              // when the review specifies a doc category, scroll to the
              // matching anchor after the target step renders.
              const idx = subSteps.findIndex((s) => s.kind === target.kind);
              if (idx < 0) return;
              setSubStepIndex(idx);
              if (target.kind === "doc-list" && target.category) {
                const cat = target.category;
                requestAnimationFrame(() => {
                  document
                    .getElementById(`docs-cat-${cat}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }
            }}
          />
        );
      case "form-org-details":
        return <CompanyDetailsStep form={form} onChange={handleFormChange} />;
      case "form-org-tax":
        return <CorporateTaxStep form={form} onChange={handleFormChange} />;
      case "form-org-review":
        return <OrgReviewStep form={form} />;
      default:
        return null;
    }
  }

  // ── Middle button label ──────────────────────────────────────────────────
  function middleButtonLabel(): string {
    if (currentSubStep.kind === "doc-list") return "Upload later";
    if (currentSubStep.kind === "contact") return ""; // hidden
    // form sub-steps
    if (reviewAllContext && isLastSubStep) {
      return reviewAllContext.current + 1 < reviewAllContext.total ? "Save & Continue" : "Save & Finish";
    }
    return "Save & Close";
  }
  const showMiddleButton = currentSubStep.kind !== "contact";
  const middleLabel = middleButtonLabel();

  // ── Progress strip ────────────────────────────────────────────────────────
  function categoryIcon(cat: string) {
    const cnt = uploadedCountFor(cat);
    const total = (docTypesByCategory[cat] ?? []).length;
    if (total === 0) return null;
    if (cnt === 0) return <span className="text-gray-300">○</span>;
    if (cnt < total) return <span className="text-amber-500">◔</span>;
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  }

  const showHelperSubtitle = currentSubStep.kind === "doc-list";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Persistent shell — top row */}
      <div className="space-y-2">
        {/* B-047 §4.4 — back-navigation demoted to gray-600 link, smaller chevron. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => void handleBackLinkClick()}
            disabled={saving}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 font-medium disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="h-3.5 w-3.5" />}
            {saving ? "Saving…" : "Back to People"}
          </button>
          <AutosaveIndicator
            state={autosave.state}
            onRetry={() => void autosave.retry()}
          />
        </div>

        {reviewAllContext && reviewAllContext.chips && reviewAllContext.onJumpToPerson ? (
          <PersonChipStrip
            chips={reviewAllContext.chips}
            current={reviewAllContext.current}
            onJump={async (idx) => {
              if (idx === reviewAllContext.current) return;
              if (currentSubStep.kind.startsWith("form-")) {
                await saveKycForm(); // best-effort silent save before jump
              }
              reviewAllContext.onJumpToPerson?.(idx);
            }}
          />
        ) : reviewAllContext ? (
          <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-2">
            {/* B-048 §3.2 — single tight line, middot separator, all left-aligned. */}
            <p className="text-sm flex items-center gap-2 flex-wrap">
              <span className="text-gray-500">
                Reviewing person {reviewAllContext.current + 1} of {reviewAllContext.total}
              </span>
              {reviewAllContext.personName && (
                <>
                  <span className="text-gray-400" aria-hidden="true">—</span>
                  <span className="font-semibold text-brand-navy">{reviewAllContext.personName}</span>
                </>
              )}
              <span className="text-gray-400" aria-hidden="true">·</span>
              <span className="text-xs text-gray-500">
                {reviewAllContext.current + 1 < reviewAllContext.total
                  ? `${reviewAllContext.total - reviewAllContext.current - 1} remaining`
                  : "Last person"}
              </span>
            </p>
          </div>
        ) : null}

        {/* B-048 §3.1 — stack roles under the name to remove the wide
            justify-between gap that opened up after the container narrowed.
            B-055 §3.2 / §3.3 — sub-step breadcrumb sits between the name
            and the roles row; "Review <name>" shortcut sits top-right of
            the same row, hidden on the review sub-step itself. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-brand-navy">{profileName}</h3>
            {currentSubStep.kind !== "form-review" &&
              currentSubStep.kind !== "form-org-review" &&
              reviewSubStepIndex >= 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSubStepIndex(reviewSubStepIndex)}
                  className="h-8 px-2 text-brand-navy hover:bg-gray-50 text-sm"
                >
                  Review {profileName}
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
          </div>
          {/* Sub-step breadcrumb — `Contact › Identity › Address …` */}
          <nav
            aria-label="Sub-step progress"
            className="flex items-center gap-0.5 flex-wrap text-xs text-gray-500"
          >
            {subSteps.map((s, i) => {
              const isCurrent = i === subStepIndex;
              const isCompleted = i < subStepIndex;
              const isFuture = i > subStepIndex;
              return (
                <Fragment key={s.id + i}>
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={isCurrent ? undefined : () => setSubStepIndex(i)}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "px-1.5 py-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      isCurrent && "font-semibold text-brand-navy cursor-default",
                      isCompleted && "text-gray-600 hover:bg-gray-100 cursor-pointer",
                      isFuture && "text-gray-400 hover:bg-gray-50 hover:text-gray-700 cursor-pointer"
                    )}
                  >
                    {subStepBreadcrumbLabel(s.kind)}
                  </button>
                </Fragment>
              );
            })}
          </nav>
          <RoleToggleRow
            serviceId={serviceId}
            profileId={profileId}
            profileName={profileName}
            profileRoleRows={profileRoleRows}
            isIndividual={isIndividual}
            onRoleRemoved={onRoleRemoved}
            onRoleAdded={onRoleAdded}
          />
        </div>

        {showHelperSubtitle && (
          <p className="text-sm text-gray-600">
            Upload the remaining documents below. Tap any category badge
            above to jump straight to that section.
          </p>
        )}
      </div>

      {/* KYC progress strip — persistent */}
      {totalDocsRequired > 0 && (
        <div className="rounded-lg border bg-white px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-gray-600 font-semibold uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            KYC Documents
            <span className={`ml-1 text-[11px] font-medium normal-case tracking-normal ${
              totalUploaded === totalDocsRequired ? "text-green-600" : "text-amber-600"
            }`}>
              · {totalUploaded} of {totalDocsRequired} uploaded
            </span>
          </p>
          <div className="flex items-center gap-x-4 gap-y-2 text-xs text-gray-600 flex-wrap">
            {personCategories.map((cat) => {
              const total = (docTypesByCategory[cat] ?? []).length;
              if (total === 0) return null;
              // B-058 §2.3 — badges are always buttons. On the docs step
              // they scroll to the in-page anchor; on any other sub-step
              // they navigate to the docs step and the effect above
              // handles the scroll once it has rendered.
              const handleClick = () => {
                if (currentSubStep.kind === "doc-list") {
                  document
                    .getElementById(`docs-cat-${cat}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                } else if (docsSubStepIndex >= 0) {
                  setPendingDocsCategory(cat);
                  setSubStepIndex(docsSubStepIndex);
                }
              };
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={handleClick}
                  className="inline-flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={`Jump to ${categoryLabel(cat)} documents`}
                >
                  {categoryIcon(cat)}
                  <span className="font-medium uppercase tracking-wide text-[10px] text-gray-700">
                    {categoryLabel(cat)}
                  </span>
                  <span className="tabular-nums">
                    ({uploadedCountFor(cat)}/{total})
                  </span>
                </button>
              );
            })}
            <DocumentStatusLegend />
          </div>
        </div>
      )}

      {/* Sub-step content */}
      <div>
        {currentSubStep.kind === "doc-list" && renderAllDocsContent()}
        {currentSubStep.kind === "contact" && renderContactContent()}
        {currentSubStep.kind.startsWith("form-") && renderFormContent()}
      </div>

      {/* B-047 §4 — Centered button bar (44pt). One Primary per screen.
          B-050 §6.2 — doc sub-steps now also surface a "Save & Close" button. */}
      <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
        <Button
          onClick={() => void goBack()}
          disabled={saving}
          className="h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent gap-1"
          aria-label="Back to previous sub-step"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        {/* Doc-list extra: "Save & Close" exits the wizard / walk entirely. */}
        {currentSubStep.kind === "doc-list" && (
          <Button
            onClick={() => onComplete()}
            disabled={saving}
            className="h-11 px-5 bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
          >
            Save & Close
          </Button>
        )}

        {showMiddleButton && (
          <Button
            onClick={() => void goNextWithMiddle()}
            disabled={saving}
            className="h-11 px-5 bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {middleLabel}
            {reviewAllContext && isLastSubStep && (
              <ChevronRight className="h-4 w-4 ml-1" />
            )}
          </Button>
        )}

        {!isLastSubStep && (
          <Button
            onClick={() => void goNext()}
            disabled={saving || docNextDisabled}
            className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90 gap-1"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Sub-step counter */}
      <p className="text-xs text-gray-500 text-center">
        Sub-step {subStepIndex + 1} of {subSteps.length} — {currentSubStep.label}
      </p>

      {/* Hidden file input for doc uploads */}
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pendingUploadTypeId) void handleUpload(pendingUploadTypeId, file);
          e.target.value = "";
          setPendingUploadTypeId(null);
        }}
      />

      {/* B-055 §4 — Hidden file input for the smart prefill uploads on the
          Identity / Address sub-steps. */}
      <input
        ref={prefillInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const kind = pendingPrefillKindRef.current;
          if (file && kind) void handlePrefillUpload(kind, file);
          e.target.value = "";
          pendingPrefillKindRef.current = null;
        }}
      />

      {/* Document detail popup */}
      {detailDoc && (
        <DocumentDetailDialog
          doc={detailDoc}
          isAdmin={false}
          open={!!detailDoc}
          onOpenChange={(open) => { if (!open) setDetailDoc(null); }}
          serviceId={serviceId}
          onDocumentReplaced={(newDoc) => {
            const updated = { ...detailDoc, ...newDoc } as DocumentDetailDoc;
            const dtId = detailDoc.document_type_id ?? null;
            setDetailDoc(null);
            setLocalDocs((prev) => {
              const without = prev.filter((d) => d.id !== detailDoc.id);
              const asClientDoc: ClientServiceDoc = {
                id: updated.id,
                file_name: updated.file_name,
                mime_type: updated.mime_type ?? null,
                verification_status: updated.verification_status ?? "pending",
                verification_result: updated.verification_result ?? null,
                admin_status: updated.admin_status ?? null,
                prefill_dismissed_at: null,
                uploaded_at: updated.uploaded_at,
                document_type_id: dtId,
                client_profile_id: profileId,
                document_types: updated.document_types
                  ? { name: updated.document_types.name, category: updated.document_types.category ?? "" }
                  : null,
              };
              return [...without, asClientDoc];
            });
            if (dtId && (updated.verification_status ?? "pending") === "pending") {
              void pollForVerification(updated.id, dtId);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── PrefillUploadCard ───────────────────────────────────────────────────────
//
// B-055 §4.2 — Optional upload affordance shown at the top of the Identity
// and Address sub-steps. The user can either upload here (we OCR + prefill
// the form fields below) OR skip and type the values manually.
//
// B-057 — the inner step (IdentityStep / ResidentialAddressStep) is now the
// single source of truth for prefill success/failure feedback (its own
// banner reacts to the new doc id). This card is intentionally neutral
// once a doc has been uploaded — it only offers a Replace affordance, no
// "Pre-filled" claim that could contradict the inner banner.

function PrefillUploadCard({
  kind,
  docType,
  uploaded,
  uploading,
  onTrigger,
}: {
  kind: "passport" | "poa";
  docType: { id: string; name: string } | undefined;
  uploaded: boolean;
  uploading: boolean;
  onTrigger: () => void;
}) {
  if (!docType) return null;

  const docLabel = kind === "passport" ? "passport" : "proof of address";
  const docLabelCapitalized = docLabel.charAt(0).toUpperCase() + docLabel.slice(1);
  const buttonLabel = kind === "passport" ? "Upload Passport" : "Upload Proof of Address";

  // Once a doc of this kind exists, collapse to a neutral "uploaded +
  // Replace" line. The inline banner inside the form below reflects
  // whether prefill succeeded.
  if (uploaded && !uploading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>{docLabelCapitalized} uploaded.</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onTrigger}
          className="h-8 text-xs text-gray-600 hover:text-gray-900"
        >
          Replace
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-4">
      <p className="text-sm font-semibold text-brand-navy mb-1">
        Have your {docLabel} handy?
      </p>
      <p className="text-xs text-gray-600 mb-3">
        Upload it here — we&apos;ll auto-fill the fields below from the
        document. You can edit anything that doesn&apos;t look right.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={onTrigger}
        disabled={uploading}
        className="h-10 px-4 gap-2"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="h-4 w-4" aria-hidden="true" />
        )}
        {uploading ? "Reading…" : buttonLabel}
      </Button>
    </div>
  );
}

// ─── ContactDetailsSubStep ───────────────────────────────────────────────────

function ContactDetailsSubStep({
  profileId,
  initialEmail,
  initialPhone,
}: {
  profileId: string;
  initialEmail: string | null;
  initialPhone: string | null;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || null, phone: phone.trim() || null }),
      });
      if (!res.ok) throw new Error("Save failed");
      setDirty(false);
      toast.success("Contact details saved", { position: "top-right" });
    } catch {
      toast.error("Failed to save contact details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-xl bg-white p-5 space-y-4">
      <p className="text-sm font-semibold text-brand-navy uppercase tracking-wide">
        Contact Details
      </p>
      {/* B-047 §1.1 — content-aware widths: email w-80, phone w-48. */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_192px] gap-4">
        <div className="space-y-1">
          <Label className="text-sm font-medium text-gray-900">Email</Label>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDirty(true); }}
            placeholder="email@example.com"
            className="text-sm h-11 md:w-80"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-gray-900">Phone</Label>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            placeholder="+230 555 0000"
            className="text-sm h-11 md:w-48"
          />
        </div>
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? "Saving…" : "Save contact details"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── PersonChipStrip ─────────────────────────────────────────────────────────

function PersonChipStrip({
  chips,
  current,
  onJump,
}: {
  chips: { id: string; name: string; completionPct: number; isComplete: boolean }[];
  current: number;
  onJump: (index: number) => void;
}) {
  const canPrev = current > 0;
  const canNext = current < chips.length - 1;
  return (
    <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => canPrev && onJump(current - 1)}
          disabled={!canPrev}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500"
          aria-label="Previous person"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 overflow-x-auto">
          <div className="inline-flex items-center gap-2 min-w-full">
            {chips.map((chip, i) => {
              const isActive = i === current;
              const dotsTotal = 10;
              const filledDots = Math.round((chip.completionPct / 100) * dotsTotal);
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onJump(i)}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`${chip.name} — ${chip.isComplete ? "complete" : `${chip.completionPct}% complete`}`}
                  className={`inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 shrink-0 ${
                    isActive
                      ? "bg-brand-navy text-white border-brand-navy"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="truncate max-w-[12rem]">{chip.name}</span>
                  {chip.isComplete ? (
                    <CheckCircle2
                      className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-green-500"}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className={`flex items-center gap-[2px] shrink-0 ${isActive ? "text-white/80" : "text-gray-400"}`}
                      aria-hidden="true"
                    >
                      {Array.from({ length: dotsTotal }).map((_, d) => (
                        <span
                          key={d}
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            d < filledDots
                              ? isActive
                                ? "bg-white"
                                : "bg-amber-500"
                              : isActive
                                ? "bg-white/30"
                                : "bg-gray-300"
                          }`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => canNext && onJump(current + 1)}
          disabled={!canNext}
          className="h-9 w-9 inline-flex items-center justify-center rounded-md text-gray-600 hover:bg-white hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500"
          aria-label="Next person"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
