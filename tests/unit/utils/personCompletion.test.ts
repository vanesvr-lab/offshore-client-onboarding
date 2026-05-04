import { describe, it, expect } from "vitest";
import { computePersonCompletion } from "@/lib/utils/personCompletion";
import type {
  DocumentType,
  DueDiligenceLevel,
  DueDiligenceRequirement,
} from "@/types";

const PERSON_FIELD_KEYS_CDD = [
  "full_name",
  "date_of_birth",
  "nationality",
  "passport_country",
  "passport_number",
  "passport_expiry",
  "occupation",
  "address_line_1",
  "address_city",
  "address_country",
  "employer",
  "years_in_role",
  "years_total_experience",
  "industry",
  "source_of_funds_type",
  "is_pep",
  "legal_issues_declared",
  "tax_identification_number",
];

function fullCddKyc(): Record<string, unknown> {
  const filled: Record<string, unknown> = {};
  for (const k of PERSON_FIELD_KEYS_CDD) {
    if (k === "is_pep" || k === "legal_issues_declared") filled[k] = false;
    else if (k === "years_in_role" || k === "years_total_experience") filled[k] = 5;
    else filled[k] = `value-${k}`;
  }
  return filled;
}

const NO_REQUIREMENTS: DueDiligenceRequirement[] = [];
const NO_DOC_TYPES: DocumentType[] = [];

describe("computePersonCompletion — individual", () => {
  it("empty kyc + no required docs → 0% and not complete", () => {
    const r = computePersonCompletion({
      kyc: {},
      recordType: "individual",
      personDocs: [],
      documentTypes: NO_DOC_TYPES,
      requirements: NO_REQUIREMENTS,
      dueDiligenceLevel: "cdd",
    });
    expect(r.percentage).toBe(0);
    expect(r.isComplete).toBe(false);
    expect(r.fieldsFilled).toBe(0);
    expect(r.fieldsTotal).toBe(PERSON_FIELD_KEYS_CDD.length);
  });

  it("null kyc → 0% and not complete", () => {
    const r = computePersonCompletion({
      kyc: null,
      recordType: "individual",
      personDocs: [],
      documentTypes: NO_DOC_TYPES,
      requirements: NO_REQUIREMENTS,
      dueDiligenceLevel: "cdd",
    });
    expect(r.percentage).toBe(0);
    expect(r.isComplete).toBe(false);
  });

  it("all required CDD fields filled, no docs required → 100% and complete", () => {
    const r = computePersonCompletion({
      kyc: fullCddKyc(),
      recordType: "individual",
      personDocs: [],
      documentTypes: NO_DOC_TYPES,
      requirements: NO_REQUIREMENTS,
      dueDiligenceLevel: "cdd",
    });
    expect(r.percentage).toBe(100);
    expect(r.isComplete).toBe(true);
    expect(r.fieldsFilled).toBe(r.fieldsTotal);
  });

  it("one missing field per section drops below 100% and is not complete", () => {
    const partial = fullCddKyc();
    delete partial.passport_number; // identity
    delete partial.address_city; // residential
    delete partial.industry; // professional
    delete partial.tax_identification_number; // declarations
    const r = computePersonCompletion({
      kyc: partial,
      recordType: "individual",
      personDocs: [],
      documentTypes: NO_DOC_TYPES,
      requirements: NO_REQUIREMENTS,
      dueDiligenceLevel: "cdd",
    });
    expect(r.isComplete).toBe(false);
    expect(r.percentage).toBeLessThan(100);
    expect(r.fieldsFilled).toBe(r.fieldsTotal - 4);
  });

  it("required document not uploaded → docsFilled < docsTotal and not complete", () => {
    const requirements: DueDiligenceRequirement[] = [
      {
        id: "req1",
        level: "sdd",
        requirement_type: "document",
        requirement_key: "passport",
        field_key: null,
        label: "Passport",
        description: null,
        document_type_id: "doc-passport",
        applies_to: "individual",
        sort_order: 1,
      },
    ];
    const documentTypes: DocumentType[] = [
      {
        id: "doc-passport",
        name: "Passport",
        category: "identity",
        applies_to: "individual",
        scope: "person",
        description: null,
        validity_period_days: null,
        ai_verification_rules: null,
        is_active: true,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const r = computePersonCompletion({
      kyc: fullCddKyc(),
      recordType: "individual",
      personDocs: [],
      documentTypes,
      requirements,
      dueDiligenceLevel: "cdd" as DueDiligenceLevel,
    });
    expect(r.docsTotal).toBe(1);
    expect(r.docsFilled).toBe(0);
    expect(r.isComplete).toBe(false);
    expect(r.percentage).toBeLessThan(100);
  });

  it("uploading the required document brings completion to 100%", () => {
    const requirements: DueDiligenceRequirement[] = [
      {
        id: "req1",
        level: "sdd",
        requirement_type: "document",
        requirement_key: "passport",
        field_key: null,
        label: "Passport",
        description: null,
        document_type_id: "doc-passport",
        applies_to: "individual",
        sort_order: 1,
      },
    ];
    const documentTypes: DocumentType[] = [
      {
        id: "doc-passport",
        name: "Passport",
        category: "identity",
        applies_to: "individual",
        scope: "person",
        description: null,
        validity_period_days: null,
        ai_verification_rules: null,
        is_active: true,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const r = computePersonCompletion({
      kyc: fullCddKyc(),
      recordType: "individual",
      personDocs: [{ document_type_id: "doc-passport", is_active: true }],
      documentTypes,
      requirements,
      dueDiligenceLevel: "cdd",
    });
    expect(r.docsFilled).toBe(1);
    expect(r.docsTotal).toBe(1);
    expect(r.percentage).toBe(100);
    expect(r.isComplete).toBe(true);
  });
});

describe("computePersonCompletion — organisation", () => {
  it("empty organisation kyc → 0%", () => {
    const r = computePersonCompletion({
      kyc: {},
      recordType: "organisation",
      personDocs: [],
      documentTypes: NO_DOC_TYPES,
      requirements: NO_REQUIREMENTS,
      dueDiligenceLevel: "cdd",
    });
    expect(r.percentage).toBe(0);
    expect(r.fieldsTotal).toBe(4);
  });

  it("all 4 organisation fields filled → 100%", () => {
    const r = computePersonCompletion({
      kyc: {
        full_name: "Acme Ltd",
        company_registration_number: "C12345",
        jurisdiction_incorporated: "MU",
        date_of_incorporation: "2020-01-01",
      },
      recordType: "organisation",
      personDocs: [],
      documentTypes: NO_DOC_TYPES,
      requirements: NO_REQUIREMENTS,
      dueDiligenceLevel: "cdd",
    });
    expect(r.percentage).toBe(100);
    expect(r.isComplete).toBe(true);
  });
});
