import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export type PendingAction = {
  section: "service_details" | "documents" | "people" | "kyc";
  serviceId: string;
  serviceName: string;
  label: string;
  personName?: string;
  anchor?: string;
};

type PersonForActions = {
  id: string;
  role: string;
  shareholding_percentage: number | null;
  client_profiles: {
    id: string;
    full_name: string;
    due_diligence_level: string;
    client_profile_kyc: Record<string, unknown> | null;
  } | null;
};

type DocumentForActions = {
  id: string;
  verification_status: string;
};

type ServiceForActions = {
  id: string;
  service_details: Record<string, unknown>;
  service_templates: {
    name: string;
    service_fields: ServiceField[] | null;
  } | null;
};

const KYC_IDENTITY_FIELDS = [
  "date_of_birth", "nationality", "passport_number", "passport_expiry", "occupation", "address",
];
const KYC_FINANCIAL_FIELDS = [
  "source_of_funds_description", "source_of_wealth_description",
];
const KYC_DECLARATION_FIELDS = [
  "is_pep", "legal_issues_declared", "tax_identification_number",
];

function countKycIncomplete(kyc: Record<string, unknown> | null): {
  identity: number;
  financial: number;
  declarations: number;
} {
  if (!kyc) return { identity: KYC_IDENTITY_FIELDS.length, financial: KYC_FINANCIAL_FIELDS.length, declarations: KYC_DECLARATION_FIELDS.length };
  const missing = (fields: string[]) =>
    fields.filter((f) => {
      const v = kyc[f];
      return v === null || v === undefined || v === "";
    }).length;
  return {
    identity: missing(KYC_IDENTITY_FIELDS),
    financial: missing(KYC_FINANCIAL_FIELDS),
    declarations: missing(KYC_DECLARATION_FIELDS),
  };
}

export function computePendingActions(
  service: ServiceForActions,
  persons: PersonForActions[],
  documents: DocumentForActions[]
): PendingAction[] {
  const actions: PendingAction[] = [];
  const serviceName = service.service_templates?.name ?? "Service";
  const serviceId = service.id;

  // Service Details
  const serviceFields = service.service_templates?.service_fields ?? [];
  const requiredFields = serviceFields.filter((f) => f.required);
  const missingRequired = requiredFields.filter((f) => {
    const v = service.service_details[f.key];
    if (Array.isArray(v)) return v.length === 0;
    return v == null || v === "";
  });
  if (missingRequired.length > 0) {
    actions.push({
      section: "service_details",
      serviceId,
      serviceName,
      label: `${missingRequired.length} required field${missingRequired.length !== 1 ? "s" : ""} missing`,
      anchor: "#section-service-details",
    });
  }

  // People
  const directors = persons.filter((p) => p.role === "director");
  const shareholders = persons.filter((p) => p.role === "shareholder");
  if (directors.length === 0) {
    actions.push({
      section: "people",
      serviceId,
      serviceName,
      label: "No director added",
      anchor: "#section-people",
    });
  }
  if (shareholders.length > 0) {
    const totalShareholder = shareholders.reduce((sum, p) => sum + (p.shareholding_percentage ?? 0), 0);
    if (totalShareholder < 95) {
      actions.push({
        section: "people",
        serviceId,
        serviceName,
        label: `Shareholding totals ${totalShareholder}% — must reach 100%`,
        anchor: "#section-people",
      });
    }
  }

  // KYC per person
  for (const person of persons) {
    const kyc = person.client_profiles?.client_profile_kyc ?? null;
    const fullName = person.client_profiles?.full_name ?? "Person";
    const kycCounts = countKycIncomplete(kyc);
    const incompleteSections: string[] = [];
    if (kycCounts.identity > 0) incompleteSections.push("Identity");
    if (kycCounts.financial > 0) incompleteSections.push("Financial");
    if (kycCounts.declarations > 0) incompleteSections.push("Declarations");

    if (incompleteSections.length > 0) {
      actions.push({
        section: "kyc",
        serviceId,
        serviceName,
        label: `KYC incomplete: ${incompleteSections.join(", ")}`,
        personName: fullName,
        anchor: "#section-people",
      });
    }
  }

  // Documents
  const missingDocs = documents.filter(
    (d) => d.verification_status === "pending" || d.verification_status === "flagged" || d.verification_status === "rejected"
  );
  if (missingDocs.length > 0) {
    actions.push({
      section: "documents",
      serviceId,
      serviceName,
      label: `${missingDocs.length} document${missingDocs.length !== 1 ? "s" : ""} need${missingDocs.length === 1 ? "s" : ""} attention`,
      anchor: "#section-documents",
    });
  }

  return actions;
}
