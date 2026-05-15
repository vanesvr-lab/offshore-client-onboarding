import { describe, it, expect } from "vitest";
import {
  computePendingItems,
  type PendingStepConfig,
} from "@/lib/services/computePendingItems";

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

/**
 * B-119 — verifies the per-subsection rows the Pending card now
 * emits for Action subsections. Only `pending` and `in_progress`
 * statuses produce rows; `done` / `blocked` / `not_applicable` are
 * filtered out.
 */
describe("computePendingItems — action subsections", () => {
  it("does not emit action rows when no subsections are passed", () => {
    const items = computePendingItems(baseInput());
    expect(items.find((i) => i.id.startsWith("action_"))).toBeUndefined();
  });

  it("emits one row per pending/in_progress subsection, none for done/blocked/not_applicable", () => {
    const items = computePendingItems({
      ...baseInput(),
      actionSubsections: [
        { action_key: "substance_review", label: "Substance Review", status: "pending" },
        { action_key: "bank_account_opening", label: "Bank Account Opening", status: "in_progress" },
        { action_key: "company_registration", label: "Company Registration", status: "done" },
        { action_key: "fsc_checklist", label: "Generate FSC Checklist", status: "blocked" },
      ],
    });
    const actionItems = items.filter((i) => i.id.startsWith("action_"));
    expect(actionItems).toHaveLength(2);
    const ids = actionItems.map((i) => i.id);
    expect(ids).toContain("action_substance_review");
    expect(ids).toContain("action_bank_account_opening");
  });

  it("uses scroll_to_section actionType with payload action-{key}", () => {
    const items = computePendingItems({
      ...baseInput(),
      actionSubsections: [
        { action_key: "company_registration", label: "Company Registration", status: "pending" },
      ],
    });
    const row = items.find((i) => i.id === "action_company_registration");
    expect(row).toBeDefined();
    expect(row?.actionType).toBe("scroll_to_section");
    expect(row?.actionPayload).toBe("action-company_registration");
  });

  it("uses 'warning' severity for in_progress and 'info' for pending", () => {
    const items = computePendingItems({
      ...baseInput(),
      actionSubsections: [
        { action_key: "substance_review", label: "Substance Review", status: "pending" },
        { action_key: "bank_account_opening", label: "Bank Account Opening", status: "in_progress" },
      ],
    });
    const pendingRow = items.find((i) => i.id === "action_substance_review");
    const inProgressRow = items.find((i) => i.id === "action_bank_account_opening");
    expect(pendingRow?.severity).toBe("info");
    expect(inProgressRow?.severity).toBe("warning");
  });

  it("doesn't emit any action rows when the input array is empty", () => {
    const items = computePendingItems({
      ...baseInput(),
      actionSubsections: [],
    });
    expect(items.filter((i) => i.id.startsWith("action_"))).toHaveLength(0);
  });
});
