import { describe, it, expect } from "vitest";
import { calculateKycCompletion } from "@/lib/utils/completionCalculator";
import type { KycRecord, DocumentRecord } from "@/types";

function individual(overrides: Partial<KycRecord> = {}): KycRecord {
  return {
    record_type: "individual",
    full_name: null,
    date_of_birth: null,
    nationality: null,
    passport_number: null,
    passport_expiry: null,
    address: null,
    email: null,
    occupation: null,
    source_of_funds_description: null,
    is_pep: null,
    legal_issues_declared: null,
    ...overrides,
  } as unknown as KycRecord;
}

function organisation(overrides: Partial<KycRecord> = {}): KycRecord {
  return {
    record_type: "organisation",
    full_name: null,
    email: null,
    address: null,
    jurisdiction_incorporated: null,
    date_of_incorporation: null,
    listed_or_unlisted: null,
    description_activity: null,
    is_pep: null,
    legal_issues_declared: null,
    ...overrides,
  } as unknown as KycRecord;
}

function doc(name: string): DocumentRecord {
  return { document_types: { name } } as unknown as DocumentRecord;
}

describe("calculateKycCompletion — individual", () => {
  it("empty record → low percentage, cannot submit", () => {
    const r = calculateKycCompletion(individual(), []);
    // Personal Details (10) + Funding (3) + Declarations (2) + Additional (1 always) = 16 total
    // Only Additional counts as 1 filled.
    expect(r.overallPercentage).toBeGreaterThanOrEqual(0);
    expect(r.overallPercentage).toBeLessThan(15);
    expect(r.canSubmit).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
    expect(r.sections).toHaveLength(4);
    expect(r.sections.map((s) => s.name)).toEqual([
      "Personal Details",
      "Funding & Financial Profile",
      "Declarations",
      "Additional Documents",
    ]);
  });

  it("fully filled individual + all required docs → 100% and canSubmit:true", () => {
    const record = individual({
      full_name: "Jane Doe",
      date_of_birth: "1990-04-21",
      nationality: "MU",
      passport_number: "X12345",
      passport_expiry: "2030-01-01",
      address: "1 Test St",
      email: "jane@example.com",
      occupation: "Engineer",
      source_of_funds_description: "Salary",
      is_pep: false,
      legal_issues_declared: false,
    });
    const docs = [
      doc("Certified Passport Copy"),
      doc("Proof of Residential Address"),
      doc("Declaration of Source of Funds"),
      doc("Evidence of Source of Funds"),
    ];
    const r = calculateKycCompletion(record, docs);
    expect(r.overallPercentage).toBe(100);
    expect(r.canSubmit).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("only fields filled, no docs → partial percentage and canSubmit:true (docs are advisory)", () => {
    const record = individual({
      full_name: "Jane Doe",
      date_of_birth: "1990-04-21",
      nationality: "MU",
      passport_number: "X12345",
      passport_expiry: "2030-01-01",
      address: "1 Test St",
      email: "jane@example.com",
      occupation: "Engineer",
      source_of_funds_description: "Salary",
      is_pep: false,
      legal_issues_declared: false,
    });
    const r = calculateKycCompletion(record, []);
    expect(r.overallPercentage).toBeGreaterThan(0);
    expect(r.overallPercentage).toBeLessThan(100);
    // Per the implementation, docs are advisory for canSubmit; required KYC fields are met.
    expect(r.canSubmit).toBe(true);
  });

  it("missing one required field blocks submission", () => {
    const record = individual({
      full_name: "Jane Doe",
      date_of_birth: "1990-04-21",
      nationality: "MU",
      passport_number: "X12345",
      passport_expiry: "2030-01-01",
      address: "1 Test St",
      email: "jane@example.com",
      occupation: null, // missing
      source_of_funds_description: "Salary",
      is_pep: false,
      legal_issues_declared: false,
    });
    const r = calculateKycCompletion(record, []);
    expect(r.canSubmit).toBe(false);
  });
});

describe("calculateKycCompletion — organisation", () => {
  it("empty organisation → low % and canSubmit:false", () => {
    const r = calculateKycCompletion(organisation(), []);
    expect(r.overallPercentage).toBeLessThan(20);
    expect(r.canSubmit).toBe(false);
    expect(r.sections.map((s) => s.name)).toEqual([
      "Company Information",
      "Corporate Documents",
      "Financial Documents",
    ]);
  });

  it("fully filled organisation + all required docs → 100%", () => {
    const record = organisation({
      full_name: "Acme Holdings Ltd",
      email: "info@acme.test",
      address: "1 Test St",
      jurisdiction_incorporated: "MU",
      date_of_incorporation: "2020-01-01",
      listed_or_unlisted: "unlisted",
      description_activity: "Trading",
      is_pep: false,
      legal_issues_declared: false,
    });
    const docs = [
      doc("Certificate of Incorporation"),
      doc("Memorandum & Articles of Association"),
      doc("Certificate of Good Standing"),
      doc("Register of Directors"),
      doc("Register of Shareholders/Members"),
      doc("Declaration of Source of Funds"),
      doc("Evidence of Source of Funds"),
    ];
    const r = calculateKycCompletion(record, docs);
    expect(r.overallPercentage).toBe(100);
    expect(r.canSubmit).toBe(true);
  });
});
