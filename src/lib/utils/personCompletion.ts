import { DD_LEVEL_INCLUDES } from "@/lib/utils/dueDiligenceConstants";
import type {
  DocumentType,
  DueDiligenceLevel,
  DueDiligenceRequirement,
} from "@/types";

/**
 * Required form-field set used by the per-person KYC wizard sub-steps.
 *
 * B-050 §5.2 / §6.1 — single source of truth for "what does it mean for
 * a person's KYC to be 100% complete". Same data as the Review step's
 * "Missing" warnings, so the dashboard %, the chip dots in the Review-all
 * walk, and the Review screen all agree.
 *
 * Order matters here only for documentation — completion is set-based.
 */
const PERSON_REQUIRED_FORM_FIELDS = {
  identity: [
    "full_name",
    "date_of_birth",
    "nationality",
    "passport_country",
    "passport_number",
    "passport_expiry",
    "occupation",
  ],
  residentialAddress: [
    "address_line_1",
    "address_city",
    "address_country",
  ],
  professional: [
    "employer",
    "years_in_role",
    "years_total_experience",
    "industry",
    "source_of_funds_type",
  ],
  declarationsCdd: [
    "is_pep",
    "legal_issues_declared",
    "tax_identification_number",
  ],
  declarationsEdd: ["relationship_history", "geographic_risk_assessment"],
  organisation: [
    "full_name",
    "company_registration_number",
    "jurisdiction_incorporated",
    "date_of_incorporation",
  ],
} as const;

interface PersonCompletionInputs {
  /** The KYC record (or `client_profile_kyc` row) for the person. */
  kyc: Record<string, unknown> | null | undefined;
  /** Profile metadata — currently only `record_type`. */
  recordType: "individual" | "organisation" | null | undefined;
  /** Documents uploaded for this person. */
  personDocs: { document_type_id?: string | null; is_active?: boolean }[];
  /** Document types known on the template. */
  documentTypes: DocumentType[];
  /** All DD requirements for the service. */
  requirements: DueDiligenceRequirement[];
  /** Effective DD level for this person. */
  dueDiligenceLevel: DueDiligenceLevel;
}

interface PersonCompletion {
  /** Required document slots filled for this person. */
  docsFilled: number;
  /** Total required document slots for this person. */
  docsTotal: number;
  /** Required form fields filled for this person. */
  fieldsFilled: number;
  /** Total required form fields for this person. */
  fieldsTotal: number;
  /** Combined percentage (0-100, rounded). 100 only if both halves are complete. */
  percentage: number;
  /** True when both halves are 100%. */
  isComplete: boolean;
}

function isFieldFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return !Number.isNaN(value);
  if (typeof value === "boolean") return true; // explicit yes/no counts as filled
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function getRequiredFieldList(
  recordType: "individual" | "organisation" | null | undefined,
  level: DueDiligenceLevel
): readonly string[] {
  if (recordType === "organisation") {
    return PERSON_REQUIRED_FORM_FIELDS.organisation;
  }
  const out: string[] = [
    ...PERSON_REQUIRED_FORM_FIELDS.identity,
    ...PERSON_REQUIRED_FORM_FIELDS.residentialAddress,
    ...PERSON_REQUIRED_FORM_FIELDS.professional,
  ];
  if (level === "cdd" || level === "edd") {
    out.push(...PERSON_REQUIRED_FORM_FIELDS.declarationsCdd);
  }
  if (level === "edd") {
    out.push(...PERSON_REQUIRED_FORM_FIELDS.declarationsEdd);
  }
  return out;
}

/**
 * Compute a person's KYC completion percentage from the same data the
 * Review step uses for "Missing" warnings (option B from the brief
 * clarification on B-050 §6.1).
 */
export function computePersonCompletion(
  inputs: PersonCompletionInputs
): PersonCompletion {
  const { kyc, recordType, personDocs, documentTypes, requirements, dueDiligenceLevel } = inputs;

  // ── Required documents (scope='person', filtered by DD level inclusion) ──
  const includedLevels = DD_LEVEL_INCLUDES[dueDiligenceLevel] ?? ["basic", "sdd", "cdd"];
  const requiredDocTypeIds = new Set(
    requirements
      .filter((r) => r.requirement_type === "document" && r.document_type_id)
      .filter((r) => includedLevels.includes(r.level as "basic" | "sdd" | "cdd" | "edd"))
      .map((r) => r.document_type_id as string)
  );
  const personScopeIds = new Set(
    documentTypes
      .filter((dt) => (dt.scope ?? "person") === "person")
      .map((dt) => dt.id)
  );
  const docsRequired = Array.from(requiredDocTypeIds).filter((id) => personScopeIds.has(id));
  const docsTotal = docsRequired.length;
  const docsFilled = docsRequired.filter((id) =>
    personDocs.some((d) => d.document_type_id === id && d.is_active !== false)
  ).length;

  // ── Required form fields ─────────────────────────────────────────────────
  const fieldKeys = getRequiredFieldList(recordType, dueDiligenceLevel);
  const fieldsTotal = fieldKeys.length;
  const fieldsFilled = fieldKeys.filter((k) =>
    isFieldFilled((kyc as Record<string, unknown> | null | undefined)?.[k])
  ).length;

  const total = docsTotal + fieldsTotal;
  const filled = docsFilled + fieldsFilled;
  const percentage = total === 0 ? 100 : Math.round((filled / total) * 100);
  const isComplete = total > 0 && filled === total;

  return { docsFilled, docsTotal, fieldsFilled, fieldsTotal, percentage, isComplete };
}
