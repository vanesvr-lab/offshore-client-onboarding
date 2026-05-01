"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IdentityStep } from "@/components/kyc/steps/IdentityStep";
import { FinancialStep } from "@/components/kyc/steps/FinancialStep";
import { DeclarationsStep } from "@/components/kyc/steps/DeclarationsStep";
import { ReviewStep } from "@/components/kyc/steps/ReviewStep";
import { DocumentDetailDialog } from "@/components/shared/DocumentDetailDialog";
import type { DocumentDetailDoc } from "@/components/shared/DocumentDetailDialog";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";
import { DocumentStatusLegend } from "@/components/shared/DocumentStatusLegend";
import { compressIfImage } from "@/lib/imageCompression";
import { DD_LEVEL_INCLUDES } from "@/lib/utils/dueDiligenceConstants";
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

// B-047 — Active state keeps the B-046 role palette (Director blue,
// Shareholder purple, UBO yellow). Inactive state is the shared neutral
// outline so the visual affordance is "checkbox-style toggle", not a
// badge that shifts hue with status.
const ROLE_TOGGLE_TONE: Record<ServicePersonRole, { active: string }> = {
  director: { active: "bg-blue-100 text-blue-700 border-blue-300" },
  shareholder: { active: "bg-purple-100 text-purple-700 border-purple-300" },
  ubo: { active: "bg-amber-100 text-amber-800 border-amber-300" },
};

const ROLE_INACTIVE_TONE = "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";

const KYC_DOC_CATEGORIES = ["identity", "financial", "compliance"] as const;
type KycDocCategory = (typeof KYC_DOC_CATEGORIES)[number];

const CATEGORY_LABELS: Record<KycDocCategory, string> = {
  identity: "Identity",
  financial: "Financial",
  compliance: "Compliance",
};

// ─── Sub-step types ───────────────────────────────────────────────────────────

type SubStep =
  | { id: string; kind: "doc-list"; category: KycDocCategory; label: string }
  | { id: "contact"; kind: "contact"; label: "Contact details" }
  | { id: "form-identity"; kind: "form-identity"; label: "Identity" }
  | { id: "form-financial"; kind: "form-financial"; label: "Financial info" }
  | { id: "form-declarations"; kind: "form-declarations"; label: "Declarations" }
  | { id: "form-review"; kind: "form-review"; label: "Review & save" }
  | { id: "form-org-details"; kind: "form-org-details"; label: "Company details" }
  | { id: "form-org-tax"; kind: "form-org-tax"; label: "Tax & financial" }
  | { id: "form-org-review"; kind: "form-org-review"; label: "Review & save" };

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
              aria-label={`Toggle ${ROLE_LABELS[role]} role`}
              onClick={() => void toggle(role)}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 h-11 px-3 text-sm font-medium rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                active ? tone.active : ROLE_INACTIVE_TONE
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
      <Label className="text-sm">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
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
        <p className="text-sm text-gray-500">Provide information about the company entity.</p>
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
        <p className="text-sm text-gray-500">Provide tax residency and financial details.</p>
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
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Review & Submit</h2>
        <p className="text-sm text-gray-500">Review the information below before submitting.</p>
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
  const docTypesByCategory = useMemo(() => {
    const eligible = ddReqDocTypeIds.length > 0
      ? documentTypes.filter((dt) => ddReqDocTypeIds.includes(dt.id))
      : documentTypes;
    const out: Record<KycDocCategory, DocumentType[]> = { identity: [], financial: [], compliance: [] };
    for (const dt of eligible) {
      const cat = (dt.category || "identity") as string;
      if ((KYC_DOC_CATEGORIES as readonly string[]).includes(cat)) {
        out[cat as KycDocCategory].push(dt);
      }
    }
    return out;
  }, [documentTypes, ddReqDocTypeIds]);

  function getUploaded(dtId: string): ClientServiceDoc | undefined {
    return profileDocs.find((d) => d.document_type_id === dtId);
  }

  function uploadedCountFor(cat: KycDocCategory): number {
    return docTypesByCategory[cat].filter((dt) => !!getUploaded(dt.id)).length;
  }

  const totalUploaded = KYC_DOC_CATEGORIES.reduce((acc, c) => acc + uploadedCountFor(c), 0);
  const totalDocsRequired = KYC_DOC_CATEGORIES.reduce((acc, c) => acc + docTypesByCategory[c].length, 0);

  // ── Sub-step computation ──────────────────────────────────────────────────
  const isCdd = !isIndividual ? false : dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd";

  const subSteps: SubStep[] = useMemo(() => {
    const out: SubStep[] = [];
    for (const cat of KYC_DOC_CATEGORIES) {
      if (docTypesByCategory[cat].length > 0) {
        out.push({
          id: `docs-${cat}`,
          kind: "doc-list",
          category: cat,
          label: `${CATEGORY_LABELS[cat]} documents`,
        });
      }
    }
    out.push({ id: "contact", kind: "contact", label: "Contact details" });
    if (isIndividual) {
      out.push({ id: "form-identity", kind: "form-identity", label: "Identity" });
      out.push({ id: "form-financial", kind: "form-financial", label: "Financial info" });
      if (isCdd) out.push({ id: "form-declarations", kind: "form-declarations", label: "Declarations" });
      out.push({ id: "form-review", kind: "form-review", label: "Review & save" });
    } else {
      out.push({ id: "form-org-details", kind: "form-org-details", label: "Company details" });
      out.push({ id: "form-org-tax", kind: "form-org-tax", label: "Tax & financial" });
      out.push({ id: "form-org-review", kind: "form-org-review", label: "Review & save" });
    }
    return out;
  }, [docTypesByCategory, isIndividual, isCdd]);

  const [subStepIndex, setSubStepIndex] = useState(0);
  // Snap back to a valid sub-step if the visible list shrinks (e.g. role flip on org).
  useEffect(() => {
    if (subStepIndex > subSteps.length - 1) setSubStepIndex(Math.max(0, subSteps.length - 1));
  }, [subSteps.length, subStepIndex]);

  const currentSubStep = subSteps[subStepIndex] ?? subSteps[0];
  const isLastSubStep = subStepIndex === subSteps.length - 1;
  const isFirstSubStep = subStepIndex === 0;

  // ── Save helpers ──────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const saveKycForm = useCallback(async (): Promise<boolean> => {
    if (!kycRecordId) return true; // no record yet — nothing to save server-side
    setSaving(true);
    try {
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId, fields: formRef.current }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }, [kycRecordId]);

  // ── Doc upload handler (mirrors KycDocListPanel) ──────────────────────────
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const [pendingUploadTypeId, setPendingUploadTypeId] = useState<string | null>(null);
  const [detailDoc, setDetailDoc] = useState<DocumentDetailDoc | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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

  // ── Sub-step transitions ──────────────────────────────────────────────────
  async function goNext() {
    // Save form data on form sub-steps before advancing
    if (currentSubStep.kind.startsWith("form-")) {
      const ok = await saveKycForm();
      if (!ok) return;
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
      if (!ok) return;
    }
    onExit();
  }

  // ── Doc sub-step gating (Next disabled until all docs uploaded) ───────────
  function isDocCategoryComplete(cat: KycDocCategory): boolean {
    return docTypesByCategory[cat].every((dt) => !!getUploaded(dt.id));
  }
  const docCategory = currentSubStep.kind === "doc-list" ? currentSubStep.category : null;
  const docNextDisabled = docCategory ? !isDocCategoryComplete(docCategory) : false;

  // ── Sub-step content render ───────────────────────────────────────────────
  function renderDocCategoryContent(cat: KycDocCategory) {
    const items = docTypesByCategory[cat];
    return (
      <div className="border rounded-xl bg-white">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <p className="text-sm font-semibold text-brand-navy uppercase tracking-wide">
            {CATEGORY_LABELS[cat]} Documents
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
                <div className="shrink-0">
                  {uploaded ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs gap-1"
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
                    >
                      <Eye className="h-3.5 w-3.5 text-gray-600" />
                      View
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                      disabled={isUploading}
                      onClick={() => {
                        setPendingUploadTypeId(dt.id);
                        uploadInputRef.current?.click();
                      }}
                    >
                      {isUploading
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <><Upload className="h-3.5 w-3.5" />Upload</>
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
      <ContactDetailsSubStep
        profileId={profileId}
        initialEmail={reviewingPerson.client_profiles?.email ?? null}
        initialPhone={reviewingPerson.client_profiles?.phone ?? null}
      />
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
            showErrorsImmediately
            personDocs={personDocsAsRecords}
            personDocTypes={documentTypes}
            kycRecordId={kycRecordId}
          />
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
  function categoryIcon(cat: KycDocCategory) {
    const cnt = uploadedCountFor(cat);
    const total = docTypesByCategory[cat].length;
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
        <button
          onClick={() => void handleBackLinkClick()}
          disabled={saving}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 font-medium disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Back to People"}
        </button>

        {reviewAllContext && (
          <div className="flex items-center justify-between rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-2">
            <p className="text-sm">
              <span className="text-gray-500">
                Reviewing person {reviewAllContext.current + 1} of {reviewAllContext.total}
              </span>
              {reviewAllContext.personName && (
                <>
                  {" "}—{" "}
                  <span className="font-semibold text-brand-navy">{reviewAllContext.personName}</span>
                </>
              )}
            </p>
            <span className="text-xs text-gray-400">
              {reviewAllContext.current + 1 < reviewAllContext.total
                ? `${reviewAllContext.total - reviewAllContext.current - 1} remaining`
                : "Last person"}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-brand-navy">{profileName}</h3>
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
            Upload your KYC documents below — we&apos;ll auto-fill the rest of the form from them.
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
          <div className="flex items-center gap-4 text-xs text-gray-600">
            {KYC_DOC_CATEGORIES.map((cat) => {
              const total = docTypesByCategory[cat].length;
              if (total === 0) return null;
              return (
                <span key={cat} className="inline-flex items-center gap-1.5">
                  {categoryIcon(cat)}
                  <span className="font-medium uppercase tracking-wide text-[10px] text-gray-700">
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="tabular-nums">
                    ({uploadedCountFor(cat)}/{total})
                  </span>
                </span>
              );
            })}
            <DocumentStatusLegend />
          </div>
        </div>
      )}

      {/* Sub-step content */}
      <div>
        {currentSubStep.kind === "doc-list" && renderDocCategoryContent(currentSubStep.category)}
        {currentSubStep.kind === "contact" && renderContactContent()}
        {currentSubStep.kind.startsWith("form-") && renderFormContent()}
      </div>

      {/* B-047 §4 — Centered three-tier button bar (44pt). One Primary per screen. */}
      <div className="pt-2 flex items-center justify-center gap-3">
        <Button
          onClick={() => void goBack()}
          disabled={saving}
          className="h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent gap-1"
          aria-label="Back to previous sub-step"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

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
    <div className="border rounded-xl bg-white p-5 space-y-3">
      <p className="text-sm font-semibold text-brand-navy uppercase tracking-wide">
        Contact Details
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-sm">Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDirty(true); }}
            placeholder="email@example.com"
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm">Phone</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            placeholder="+230 555 0000"
            className="text-sm"
          />
        </div>
      </div>
      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving}
            className="h-7 px-3 text-xs bg-brand-navy hover:bg-brand-blue"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save contact details"}
          </Button>
        </div>
      )}
    </div>
  );
}
