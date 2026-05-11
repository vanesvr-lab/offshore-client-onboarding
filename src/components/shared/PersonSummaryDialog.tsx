"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReviewStep, type ReviewJumpTarget } from "@/components/kyc/steps/ReviewStep";
import type {
  DocumentType,
  DocumentRecord,
  DueDiligenceLevel,
  DueDiligenceRequirement,
  KycRecord,
  VerificationResult,
  VerificationStatus,
} from "@/types";
import type { ServicePerson, ClientServiceDoc } from "@/app/(client)/services/[id]/page";

/** B-090 — per-section key admin uses to smooth-scroll to the matching
 *  KycLongFormSection anchor. `"any"` = no specific section (bottom
 *  "Open Review KYC to edit" button, or doc-only edits). The client
 *  caller ignores the value and just opens its inline review flow. */
export type SummarySection = "identity" | "financial" | "compliance" | "tax" | "any";

export interface PersonSummaryDialogProps {
  person: ServicePerson;
  documents: ClientServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  onClose: () => void;
  /** Fires when admin/client clicks an Edit affordance. `section` indicates
   *  which subsection the user wants to edit; `"any"` is the bottom "Open
   *  Review KYC to edit" button or doc-list edits with no specific anchor. */
  onEdit: (section: SummarySection) => void;
}

export function mapToReviewKycRecord(person: ServicePerson): KycRecord {
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

function mapJumpTargetToSection(
  target: ReviewJumpTarget,
  isOrganisation: boolean,
): SummarySection {
  switch (target.kind) {
    case "form-identity":
    case "form-residential-address":
      return "identity";
    case "form-financial":
      // Organisations group financial info under the "tax" subsection
      // (Tax / Financial); individuals have a dedicated "financial" anchor.
      return isOrganisation ? "tax" : "financial";
    case "form-declarations":
      // Organisations don't have a `compliance` subsection — fall back to
      // "any" so the smooth-scroll lands on the first available anchor.
      return isOrganisation ? "any" : "compliance";
    case "doc-list":
      return "any";
  }
}

/** B-091 — Extracted body so the service-level summary modal can render
 *  per-profile content inline without nesting another Dialog. The
 *  PersonSummaryDialog wrapper below is a thin Dialog shell around this. */
export interface PersonSummaryBodyProps {
  person: ServicePerson;
  documents: ClientServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  onEdit: (section: SummarySection) => void;
}

export function PersonSummaryBody({
  person,
  documents,
  documentTypes,
  requirements,
  onEdit,
}: PersonSummaryBodyProps) {
  const profileId = person.client_profiles?.id ?? "";
  const isOrganisation = person.client_profiles?.record_type === "organisation";
  const personDocs = documents
    .filter((d) => d.client_profile_id === profileId)
    .map<DocumentRecord>((d) => ({
      id: d.id,
      client_id: "",
      kyc_record_id: null,
      document_type_id: d.document_type_id ?? "",
      file_path: "",
      file_name: d.file_name,
      file_size: null,
      mime_type: d.mime_type ?? null,
      verification_status: d.verification_status as VerificationStatus,
      verification_result: d.verification_result as VerificationResult | null,
      expiry_date: null,
      notes: null,
      is_active: true,
      uploaded_by: null,
      uploaded_at: d.uploaded_at,
      verified_at: null,
      admin_status: d.admin_status as "pending" | "approved" | "rejected" | null,
      admin_status_note: null,
      admin_status_by: null,
      admin_status_at: null,
    }));
  const kycRecord = mapToReviewKycRecord(person);
  const ddLevel = (person.client_profiles?.due_diligence_level as DueDiligenceLevel | null) ?? "cdd";

  return (
    <ReviewStep
      kycRecord={kycRecord}
      documents={personDocs}
      documentTypes={documentTypes}
      dueDiligenceLevel={ddLevel}
      requirements={requirements}
      form={kycRecord}
      onJumpTo={(target) => onEdit(mapJumpTargetToSection(target, isOrganisation))}
    />
  );
}

export function PersonSummaryDialog({
  person,
  documents,
  documentTypes,
  requirements,
  onClose,
  onEdit,
}: PersonSummaryDialogProps) {
  const personName = person.client_profiles?.full_name ?? "Person";

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto z-[100]">
        <DialogHeader>
          <DialogTitle>{personName} — Summary</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <PersonSummaryBody
            person={person}
            documents={documents}
            documentTypes={documentTypes}
            requirements={requirements}
            onEdit={onEdit}
          />
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button
            variant="outline"
            onClick={() => onEdit("any")}
            className="h-10 px-4"
          >
            Open Review KYC to edit
          </Button>
          <Button
            onClick={onClose}
            className="h-10 px-5 bg-brand-navy text-white hover:bg-brand-navy/90"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
