// B-075 — single source of truth for KYC section/field schema.
//
// Both the client `KycStepWizard` and the admin `KycLongForm` consume
// these arrays so the two presentations render the same set of fields,
// in the same order, with the same labels. Categories map to the inline
// review keys used since B-069/B-073/B-074 (`kyc:<profileId>:<category>`).
//
// Out of scope for this brief: admin-only fields. Those land in a
// follow-up brief once the FSC checklist PDFs are diffed against
// `client_profile_kyc`.

export type KycFieldType =
  | "text"
  | "textarea"
  | "date"
  | "select"
  | "boolean"
  | "country";

export interface KycFieldOption {
  value: string;
  label: string;
}

export interface KycField {
  /** Maps to a `client_profile_kyc` column (or `client_profiles` for full_name/email/phone). */
  key: string;
  /** Canonical label — taken from the client wizard. */
  label: string;
  type: KycFieldType;
  required?: boolean;
  placeholder?: string;
  /** Helper text shown below the input. */
  helperText?: string;
  options?: KycFieldOption[];
  /** Hidden at SDD; shown at CDD/EDD. */
  cddOrAbove?: boolean;
  /** Shown only at EDD. */
  eddOnly?: boolean;
  /** Renders the Sparkles AI marker next to the label. */
  aiExtractable?: boolean;
  /**
   * If set, this field is only rendered when the named field equals one
   * of these values. Used for the source-of-funds "Other" follow-up.
   */
  showWhen?: { field: string; equals: unknown[] };
}

export type KycCategoryKey =
  | "identity"
  | "financial"
  | "compliance"
  | "professional"
  | "tax"
  | "adverse_media"
  | "wealth"
  | "additional";

export interface KycSection {
  title: string;
  description?: string;
  /** Maps to section_key for inline reviews: `kyc:<profileId>:<categoryKey>`. */
  categoryKey: KycCategoryKey;
  fields: KycField[];
  /** Hide whole section at SDD (matches client wizard skipping declarations on SDD). */
  cddOrAbove?: boolean;
  /** Show whole section only at EDD. */
  eddOnly?: boolean;
}

// ─── Individual ─────────────────────────────────────────────────────────────

export const KYC_SECTIONS_INDIVIDUAL: KycSection[] = [
  {
    title: "Your Identity",
    description:
      "Please provide your identity information and upload your passport and proof of address.",
    categoryKey: "identity",
    fields: [
      { key: "full_name", label: "Full legal name", type: "text", required: true, placeholder: "As it appears on your passport", aiExtractable: true },
      { key: "aliases", label: "Aliases / other names", type: "text", placeholder: "Maiden name, nicknames, etc." },
      { key: "date_of_birth", label: "Date of birth", type: "date", required: true, aiExtractable: true },
      { key: "nationality", label: "Nationality", type: "country", required: true, placeholder: "Select nationality...", aiExtractable: true },
      { key: "passport_country", label: "Passport country", type: "country", required: true, placeholder: "Country that issued your passport...", aiExtractable: true },
      { key: "passport_number", label: "Passport number", type: "text", required: true, aiExtractable: true },
      { key: "passport_expiry", label: "Passport expiry date", type: "date", required: true, aiExtractable: true },
      { key: "address", label: "Residential address", type: "textarea", required: true, placeholder: "Full residential address including country", aiExtractable: true },
      { key: "email", label: "Email address", type: "text", required: true },
      { key: "phone", label: "Phone number", type: "text" },
    ],
  },
  {
    title: "Financial Profile",
    description:
      "Help us understand the source of your funds and financial background. This is required for regulatory compliance.",
    categoryKey: "financial",
    fields: [
      { key: "occupation", label: "Current occupation / job title", type: "text", required: true, placeholder: "e.g. Head of Compliance" },
      { key: "employer", label: "Current employer", type: "text", required: true, placeholder: "e.g. Stark Industries Holdings" },
      {
        key: "industry",
        label: "Industry",
        type: "select",
        required: true,
        options: [
          { value: "Banking & Financial Services", label: "Banking & Financial Services" },
          { value: "Investment Management", label: "Investment Management" },
          { value: "Legal Services", label: "Legal Services" },
          { value: "Accounting & Audit", label: "Accounting & Audit" },
          { value: "Real Estate", label: "Real Estate" },
          { value: "Technology", label: "Technology" },
          { value: "Manufacturing", label: "Manufacturing" },
          { value: "Energy & Resources", label: "Energy & Resources" },
          { value: "Retail & Consumer", label: "Retail & Consumer" },
          { value: "Healthcare", label: "Healthcare" },
          { value: "Government / Public Sector", label: "Government / Public Sector" },
          { value: "Non-profit", label: "Non-profit" },
          { value: "Other", label: "Other" },
        ],
      },
      {
        key: "source_of_funds_type",
        label: "Source of funds",
        type: "select",
        required: true,
        cddOrAbove: true,
        options: [
          { value: "salary", label: "Salary" },
          { value: "investments", label: "Investments" },
          { value: "inheritance", label: "Inheritance" },
          { value: "business_sale", label: "Business sale" },
          { value: "other", label: "Other" },
        ],
      },
      {
        key: "source_of_funds_other",
        label: "Please specify",
        type: "text",
        required: true,
        cddOrAbove: true,
        showWhen: { field: "source_of_funds_type", equals: ["other"] },
        placeholder: "Describe your source of funds",
      },
      {
        key: "source_of_funds_description",
        label: "Additional context",
        type: "textarea",
        cddOrAbove: true,
        placeholder:
          "Anything else regulators should know — employer / business / asset names, jurisdictions, etc.",
      },
      { key: "work_address", label: "Work address", type: "textarea", cddOrAbove: true, placeholder: "Business / employer address" },
      { key: "work_email", label: "Work email", type: "text", cddOrAbove: true, placeholder: "name@company.com" },
      { key: "work_phone", label: "Work phone", type: "text", cddOrAbove: true, placeholder: "+230 555 0000" },
      {
        key: "source_of_wealth_description",
        label: "Source of wealth description",
        type: "textarea",
        required: true,
        eddOnly: true,
        placeholder:
          "Explain how you accumulated your overall wealth — business sale, inheritance, investment returns, etc.",
      },
    ],
  },
  {
    title: "Declarations",
    description:
      "Please complete these compliance declarations honestly and completely. This information is required for regulatory compliance.",
    categoryKey: "compliance",
    cddOrAbove: true,
    fields: [
      { key: "is_pep", label: "Politically Exposed Person (PEP)", type: "boolean", required: true },
      {
        key: "pep_details",
        label: "PEP details",
        type: "textarea",
        required: true,
        showWhen: { field: "is_pep", equals: [true] },
        placeholder: "Describe your PEP status — role, country, period, and nature of exposure",
      },
      { key: "legal_issues_declared", label: "Legal issues or criminal record", type: "boolean", required: true },
      {
        key: "legal_issues_details",
        label: "Legal issues details",
        type: "textarea",
        required: true,
        showWhen: { field: "legal_issues_declared", equals: [true] },
        placeholder:
          "Describe the nature of the legal issue, jurisdiction, outcome, and current status",
      },
      {
        key: "tax_identification_number",
        label: "Tax identification number",
        type: "text",
        placeholder: "e.g. NI number, SSN, TIN",
        helperText: "Your jurisdiction's tax identifier (e.g. NI number, SSN, TIN).",
      },
      {
        key: "relationship_history",
        label: "Customer relationship history",
        type: "textarea",
        eddOnly: true,
        placeholder:
          "Prior banking relationships, financial institutions, and length of relationships",
      },
      {
        key: "geographic_risk_assessment",
        label: "Geographic risk information",
        type: "textarea",
        eddOnly: true,
        placeholder:
          "Countries where you conduct business, hold assets, or have financial connections",
      },
    ],
  },
];

// ─── Organisation ───────────────────────────────────────────────────────────

export const KYC_SECTIONS_ORGANISATION: KycSection[] = [
  {
    title: "Company Details",
    description: "Provide information about the company entity.",
    categoryKey: "identity",
    fields: [
      { key: "full_name", label: "Company name", type: "text", required: true, placeholder: "Legal entity name" },
      { key: "company_registration_number", label: "Registration number", type: "text", required: true, placeholder: "Company registration number" },
      { key: "jurisdiction_incorporated", label: "Jurisdiction of incorporation", type: "text", required: true, placeholder: "e.g. Mauritius" },
      { key: "date_of_incorporation", label: "Date of incorporation", type: "date", required: true },
      { key: "industry_sector", label: "Industry sector", type: "text", placeholder: "e.g. Financial Services" },
      {
        key: "listed_or_unlisted",
        label: "Listed or unlisted",
        type: "select",
        options: [
          { value: "listed", label: "Listed" },
          { value: "unlisted", label: "Unlisted" },
        ],
      },
      {
        key: "description_activity",
        label: "Business description",
        type: "textarea",
        placeholder: "Describe the company's main activities",
      },
    ],
  },
  {
    title: "Tax / Financial",
    description: "Provide tax residency and financial details.",
    categoryKey: "tax",
    fields: [
      { key: "jurisdiction_tax_residence", label: "Tax residency jurisdiction", type: "text", placeholder: "e.g. Mauritius" },
      { key: "tax_identification_number", label: "Tax identification number", type: "text", placeholder: "TIN or equivalent" },
      { key: "regulatory_licenses", label: "Regulatory licences", type: "textarea", placeholder: "List any regulatory licences held" },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export type DueDiligenceLevel = "sdd" | "cdd" | "edd";

/** Apply DD-level gating to a section: returns null when the section should be hidden. */
export function gateSectionForLevel(
  section: KycSection,
  level: DueDiligenceLevel,
): KycSection | null {
  if (section.cddOrAbove && level === "sdd") return null;
  if (section.eddOnly && level !== "edd") return null;
  const fields = section.fields.filter((f) => {
    if (f.cddOrAbove && level === "sdd") return false;
    if (f.eddOnly && level !== "edd") return false;
    return true;
  });
  if (fields.length === 0) return null;
  return { ...section, fields };
}

/** Filter conditional fields (`showWhen`) against the current form values. */
export function visibleFields(
  fields: KycField[],
  values: Record<string, unknown>,
): KycField[] {
  return fields.filter((f) => {
    if (!f.showWhen) return true;
    const current = values[f.showWhen.field];
    return f.showWhen.equals.includes(current);
  });
}
