import type { KycRecord, DocumentRecord } from "@/types";

export interface CompletionSection {
  name: string;
  filled: number;
  total: number;
  missingFields: string[];
}

export interface CompletionResult {
  overallPercentage: number;
  sections: CompletionSection[];
  canSubmit: boolean;
  blockers: string[];
}

// Document type names that count towards section completion
const IDENTITY_DOC_NAMES = ["Certified Passport Copy", "Proof of Residential Address"];
const FINANCIAL_DOC_NAMES = [
  "Declaration of Source of Funds",
  "Evidence of Source of Funds",
];
const CORPORATE_DOC_NAMES = [
  "Certificate of Incorporation",
  "Memorandum & Articles of Association",
  "Certificate of Good Standing",
];

function docNames(documents: DocumentRecord[]): string[] {
  return documents.map((d) => (d as unknown as { document_types?: { name?: string } }).document_types?.name ?? "");
}

export function calculateKycCompletion(
  record: KycRecord,
  documents: DocumentRecord[]
): CompletionResult {
  const isIndividual = record.record_type === "individual";
  const docs = docNames(documents);

  let sections: CompletionSection[];

  if (isIndividual) {
    // Section 1: Personal Details
    const s1Fields: Array<[string, string]> = [
      ["full_name", "Full name"],
      ["date_of_birth", "Date of birth"],
      ["nationality", "Nationality"],
      ["passport_number", "Passport number"],
      ["passport_expiry", "Passport expiry"],
      ["address", "Residential address"],
      ["email", "Email"],
      ["occupation", "Occupation"],
    ];
    const s1DocRequired = IDENTITY_DOC_NAMES;
    const s1Missing = s1Fields
      .filter(([f]) => !record[f as keyof KycRecord])
      .map(([, label]) => label);
    const s1DocMissing = s1DocRequired.filter((n) => !docs.includes(n));
    const s1Total = s1Fields.length + s1DocRequired.length;
    const s1Filled = s1Total - s1Missing.length - s1DocMissing.length;

    // Section 2: Funding & Financial Profile
    const s2Fields: Array<[string, string]> = [
      ["source_of_funds_description", "Source of funds"],
    ];
    const s2DocRequired = FINANCIAL_DOC_NAMES;
    const s2Missing = s2Fields
      .filter(([f]) => !record[f as keyof KycRecord])
      .map(([, label]) => label);
    const s2DocMissing = s2DocRequired.filter((n) => !docs.includes(n));
    const s2Total = s2Fields.length + s2DocRequired.length;
    const s2Filled = s2Total - s2Missing.length - s2DocMissing.length;

    // Section 3: Declarations
    const s3Fields: Array<[string, string]> = [
      ["is_pep", "PEP declaration"],
      ["legal_issues_declared", "Legal issues declaration"],
    ];
    const s3Missing = s3Fields
      .filter(([f]) => record[f as keyof KycRecord] === null || record[f as keyof KycRecord] === undefined)
      .map(([, label]) => label);
    const s3Total = s3Fields.length;
    const s3Filled = s3Total - s3Missing.length;

    // Section 4: Supporting Documents (optional extras — always "complete")
    const s4Total = 1;
    const s4Filled = 1;

    sections = [
      { name: "Personal Details", filled: s1Filled, total: s1Total, missingFields: [...s1Missing, ...s1DocMissing.map((n) => `${n} (document)`)] },
      { name: "Funding & Financial Profile", filled: s2Filled, total: s2Total, missingFields: [...s2Missing, ...s2DocMissing.map((n) => `${n} (document)`)] },
      { name: "Declarations", filled: s3Filled, total: s3Total, missingFields: s3Missing },
      { name: "Additional Documents", filled: s4Filled, total: s4Total, missingFields: [] },
    ];
  } else {
    // Organisation — Section 1: Company Information
    const s1Fields: Array<[string, string]> = [
      ["full_name", "Company name"],
      ["email", "Email"],
      ["address", "Business address"],
      ["jurisdiction_incorporated", "Jurisdiction of incorporation"],
      ["date_of_incorporation", "Date of incorporation"],
      ["listed_or_unlisted", "Listed / Unlisted"],
      ["description_activity", "Description of activity"],
    ];
    const s1DocRequired = CORPORATE_DOC_NAMES;
    const s1Missing = s1Fields
      .filter(([f]) => !record[f as keyof KycRecord])
      .map(([, label]) => label);
    const s1DocMissing = s1DocRequired.filter((n) => !docs.includes(n));
    const s1Total = s1Fields.length + s1DocRequired.length;
    const s1Filled = s1Total - s1Missing.length - s1DocMissing.length;

    // Section 2: Corporate Documents (uploads only)
    const s2DocRequired = [
      "Register of Directors",
      "Register of Shareholders/Members",
    ];
    const s2DocMissing = s2DocRequired.filter((n) => !docs.includes(n));
    const s2Total = s2DocRequired.length;
    const s2Filled = s2Total - s2DocMissing.length;

    // Section 3: Financial
    const s3DocRequired = FINANCIAL_DOC_NAMES;
    const s3DocMissing = s3DocRequired.filter((n) => !docs.includes(n));
    const s3Total = s3DocRequired.length;
    const s3Filled = s3Total - s3DocMissing.length;

    sections = [
      { name: "Company Information", filled: s1Filled, total: s1Total, missingFields: [...s1Missing, ...s1DocMissing.map((n) => `${n} (document)`)] },
      { name: "Corporate Documents", filled: s2Filled, total: s2Total, missingFields: s2DocMissing.map((n) => `${n} (document)`) },
      { name: "Financial Documents", filled: s3Filled, total: s3Total, missingFields: s3DocMissing.map((n) => `${n} (document)`) },
    ];
  }

  const totalFilled = sections.reduce((sum, s) => sum + s.filled, 0);
  const totalItems = sections.reduce((sum, s) => sum + s.total, 0);
  const overallPercentage = totalItems > 0 ? Math.round((totalFilled / totalItems) * 100) : 0;

  const blockers = sections
    .flatMap((s) => s.missingFields)
    .filter(Boolean);

  // canSubmit: required KYC fields all filled (doc requirements are advisory for submission)
  const requiredIndividual = [
    "full_name", "email", "date_of_birth", "nationality", "passport_number",
    "passport_expiry", "address", "occupation", "source_of_funds_description",
  ];
  const requiredOrganisation = [
    "full_name", "email", "address", "jurisdiction_incorporated",
    "date_of_incorporation", "listed_or_unlisted", "description_activity",
  ];
  const required = isIndividual ? requiredIndividual : requiredOrganisation;
  const rec = record as unknown as Record<string, unknown>;
  const canSubmit = required.every(
    (f) => rec[f] !== null && rec[f] !== undefined && rec[f] !== ""
  ) && record.is_pep !== null && record.legal_issues_declared !== null;

  return { overallPercentage, sections, canSubmit, blockers };
}
