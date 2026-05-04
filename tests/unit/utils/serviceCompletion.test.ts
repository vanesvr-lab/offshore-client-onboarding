import { describe, it, expect } from "vitest";
import {
  calcServiceDetailsCompletion,
  calcDocumentsCompletion,
  calcPeopleCompletion,
  calcKycCompletion,
  calcSectionCompletion,
  calcOverallCompletion,
} from "@/lib/utils/serviceCompletion";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

function field(
  key: string,
  required = true,
  section: string | undefined = undefined,
): ServiceField {
  return { key, label: key, type: "text", required, section } as unknown as ServiceField;
}

describe("calcServiceDetailsCompletion", () => {
  it("0% when no required fields are filled", () => {
    const r = calcServiceDetailsCompletion(
      [field("a"), field("b")],
      {},
    );
    expect(r.percentage).toBe(0);
    expect(r.ragStatus).toBe("red");
  });

  it("100% when all required fields are filled", () => {
    const r = calcServiceDetailsCompletion(
      [field("a"), field("b")],
      { a: "x", b: "y" },
    );
    expect(r.percentage).toBe(100);
    expect(r.ragStatus).toBe("green");
  });

  it("50% with one of two required filled (amber)", () => {
    const r = calcServiceDetailsCompletion(
      [field("a"), field("b")],
      { a: "x" },
    );
    expect(r.percentage).toBe(50);
    expect(r.ragStatus).toBe("amber");
  });

  it("treats arrays as filled when non-empty, empty when length 0", () => {
    const f = [field("tags")];
    expect(calcServiceDetailsCompletion(f, { tags: [] }).percentage).toBe(0);
    expect(calcServiceDetailsCompletion(f, { tags: ["x"] }).percentage).toBe(100);
  });

  it("no required fields, no fields → 100%", () => {
    expect(calcServiceDetailsCompletion([], {}).percentage).toBe(100);
  });

  it("no required fields, optional any-filled → 100%; none filled → 0%", () => {
    expect(calcServiceDetailsCompletion([field("a", false)], { a: "x" }).percentage).toBe(100);
    expect(calcServiceDetailsCompletion([field("a", false)], {}).percentage).toBe(0);
  });
});

describe("calcDocumentsCompletion", () => {
  it("no documents → 0% red", () => {
    expect(calcDocumentsCompletion([])).toEqual({ percentage: 0, ragStatus: "red" });
  });

  it("all verified → 100% green", () => {
    const r = calcDocumentsCompletion([
      { verification_status: "verified" },
      { verification_status: "verified" },
    ]);
    expect(r).toEqual({ percentage: 100, ragStatus: "green" });
  });

  it("flagged document → amber", () => {
    const r = calcDocumentsCompletion([
      { verification_status: "verified" },
      { verification_status: "flagged" },
    ]);
    expect(r.ragStatus).toBe("amber");
  });

  it("partial verification → amber (not green) even without flags", () => {
    const r = calcDocumentsCompletion([
      { verification_status: "verified" },
      { verification_status: "pending" },
    ]);
    expect(r.percentage).toBe(50);
    expect(r.ragStatus).toBe("amber");
  });
});

describe("calcPeopleCompletion", () => {
  it("no persons → 0% red", () => {
    expect(calcPeopleCompletion([])).toEqual({ percentage: 0, ragStatus: "red" });
  });

  it("director + shareholders ≥ 95% → 100% green", () => {
    const r = calcPeopleCompletion([
      { role: "director", shareholding_percentage: null },
      { role: "shareholder", shareholding_percentage: 95 },
    ]);
    expect(r).toEqual({ percentage: 100, ragStatus: "green" });
  });

  it("director only (no shareholders) → 100% green", () => {
    const r = calcPeopleCompletion([
      { role: "director", shareholding_percentage: null },
    ]);
    expect(r).toEqual({ percentage: 100, ragStatus: "green" });
  });

  it("shareholders only, no director → amber 50%", () => {
    const r = calcPeopleCompletion([
      { role: "shareholder", shareholding_percentage: 100 },
    ]);
    expect(r.ragStatus).toBe("amber");
    expect(r.percentage).toBe(50);
  });

  it("director with under-95% shareholders → amber 50%", () => {
    const r = calcPeopleCompletion([
      { role: "director", shareholding_percentage: null },
      { role: "shareholder", shareholding_percentage: 50 },
    ]);
    expect(r.percentage).toBe(50);
    expect(r.ragStatus).toBe("amber");
  });
});

describe("calcKycCompletion", () => {
  it("no persons → 0% red", () => {
    expect(calcKycCompletion([])).toEqual({ percentage: 0, ragStatus: "red" });
  });

  it("missing kyc → 0% across the board", () => {
    const r = calcKycCompletion([{ client_profiles: { client_profile_kyc: null } }]);
    expect(r.percentage).toBe(0);
  });

  it("fully filled kyc on a single person → 100% green", () => {
    const kyc = {
      date_of_birth: "1990-04-21",
      nationality: "MU",
      passport_number: "X12345",
      passport_expiry: "2030-01-01",
      occupation: "Engineer",
      address: "1 Test St",
      source_of_funds_description: "Salary",
      source_of_wealth_description: "Inherited",
      is_pep: false,
      legal_issues_declared: false,
    };
    const r = calcKycCompletion([{ client_profiles: { client_profile_kyc: kyc } }]);
    expect(r.percentage).toBe(100);
    expect(r.ragStatus).toBe("green");
  });
});

describe("calcSectionCompletion", () => {
  it("no fields in section → 100% green", () => {
    const r = calcSectionCompletion([], {}, "company_setup");
    expect(r).toEqual({ percentage: 100, ragStatus: "green" });
  });

  it("matches financial section by name", () => {
    const fields = [field("revenue", true, "Financial")];
    expect(calcSectionCompletion(fields, {}, "financial").percentage).toBe(0);
    expect(calcSectionCompletion(fields, { revenue: 100 }, "financial").percentage).toBe(100);
  });
});

describe("calcOverallCompletion", () => {
  it("no sections → 0%", () => {
    expect(calcOverallCompletion([])).toEqual({ percentage: 0, ragStatus: "red" });
  });

  it("averages section percentages", () => {
    const r = calcOverallCompletion([
      { percentage: 100, ragStatus: "green" },
      { percentage: 0, ragStatus: "red" },
    ]);
    expect(r.percentage).toBe(50);
    expect(r.ragStatus).toBe("amber");
  });
});
