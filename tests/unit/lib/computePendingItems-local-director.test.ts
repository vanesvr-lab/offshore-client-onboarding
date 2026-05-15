import { describe, it, expect } from "vitest";
import {
  computePendingItems,
  type PendingStepConfig,
} from "@/lib/services/computePendingItems";

// B-121 — exercises the local-director shortfall row added to
// computePendingItems. Row appears when requiredLocalDirectors > 0 AND
// localDirectorCount < requiredLocalDirectors. Anchor: step-people-kyc.

const NO_PROFILES: Parameters<typeof computePendingItems>[0]["profiles"] = [];
const NO_REVIEWS: Parameters<typeof computePendingItems>[0]["sectionReviews"] = [];

function baseInput(): Parameters<typeof computePendingItems>[0] {
  const steps: PendingStepConfig[] = [
    { stepId: "step-company-setup", sectionKey: "company_setup", label: "Company Setup", pct: 100 },
    { stepId: "step-financial", sectionKey: "financial", label: "Financial", pct: 100 },
    { stepId: "step-banking", sectionKey: "banking", label: "Banking", pct: 100 },
    { stepId: "step-people-kyc", sectionKey: "people", label: "People & KYC", pct: 100 },
    { stepId: "step-documents", sectionKey: "documents", label: "Documents", pct: 100 },
  ];
  return {
    steps,
    sectionReviews: NO_REVIEWS,
    profiles: NO_PROFILES,
    missingDocCount: 0,
    autoAlerts: [],
    manualAlerts: [],
  };
}

describe("computePendingItems — local director shortfall", () => {
  it("does not emit a row when the template has no rule (required = 0)", () => {
    const items = computePendingItems({
      ...baseInput(),
      requiredLocalDirectors: 0,
      localDirectorCount: 0,
    });
    expect(items.find((i) => i.id === "local_director_required")).toBeUndefined();
  });

  it("does not emit a row when count meets the requirement", () => {
    const items = computePendingItems({
      ...baseInput(),
      requiredLocalDirectors: 1,
      localDirectorCount: 1,
    });
    expect(items.find((i) => i.id === "local_director_required")).toBeUndefined();
  });

  it("does not emit a row when count exceeds the requirement", () => {
    const items = computePendingItems({
      ...baseInput(),
      requiredLocalDirectors: 1,
      localDirectorCount: 2,
    });
    expect(items.find((i) => i.id === "local_director_required")).toBeUndefined();
  });

  it("emits a warning row labelled with the shortfall when count < requirement", () => {
    const items = computePendingItems({
      ...baseInput(),
      requiredLocalDirectors: 1,
      localDirectorCount: 0,
    });
    const row = items.find((i) => i.id === "local_director_required");
    expect(row).toBeDefined();
    expect(row!.severity).toBe("warning");
    expect(row!.label).toMatch(/Local director required \(1 more needed\)/);
    expect(row!.actionType).toBe("scroll_to_section");
    expect(row!.actionPayload).toBe("step-people-kyc");
  });

  it("pluralises the shortfall and surfaces the current count in the detail", () => {
    const items = computePendingItems({
      ...baseInput(),
      requiredLocalDirectors: 3,
      localDirectorCount: 1,
    });
    const row = items.find((i) => i.id === "local_director_required");
    expect(row).toBeDefined();
    expect(row!.label).toMatch(/2 more needed/);
    expect(row!.detail).toMatch(/Template requires 3 local resident directors/);
    expect(row!.detail).toMatch(/currently have 1/);
  });

  it("treats missing inputs as zero so legacy callers keep working", () => {
    const items = computePendingItems(baseInput());
    expect(items.find((i) => i.id === "local_director_required")).toBeUndefined();
  });
});
