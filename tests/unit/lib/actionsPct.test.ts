import { describe, it, expect } from "vitest";

// B-119 — `actionsPct` lives inline inside `ServiceDetailClient` as a
// useMemo so it can read the live `adminActions` state. The math is
// `done_count / total_bound_subsections × 100`, rounded. These tests
// duplicate the algorithm directly so a future refactor that lifts the
// computation into a helper has coverage to land on.

type Status = "pending" | "in_progress" | "done" | "blocked" | "not_applicable";

function actionsPct(
  bindings: Array<{ action_key: string }>,
  byKey: Record<string, { status: Status }>,
): number {
  if (bindings.length === 0) return 0;
  let done = 0;
  for (const ta of bindings) {
    if (byKey[ta.action_key]?.status === "done") done += 1;
  }
  return Math.round((done / bindings.length) * 100);
}

describe("actionsPct — section completion math", () => {
  it("returns 0 when there are no bindings (pill suppressed upstream)", () => {
    expect(actionsPct([], {})).toBe(0);
  });

  it("returns 0 when no subsection is done", () => {
    expect(
      actionsPct(
        [
          { action_key: "substance_review" },
          { action_key: "bank_account_opening" },
          { action_key: "company_registration" },
          { action_key: "fsc_checklist" },
        ],
        {
          substance_review: { status: "pending" },
          bank_account_opening: { status: "in_progress" },
          company_registration: { status: "pending" },
          fsc_checklist: { status: "blocked" },
        },
      ),
    ).toBe(0);
  });

  it("rounds half-pcts in the standard way (3 of 4 = 75)", () => {
    expect(
      actionsPct(
        [
          { action_key: "a" },
          { action_key: "b" },
          { action_key: "c" },
          { action_key: "d" },
        ],
        {
          a: { status: "done" },
          b: { status: "done" },
          c: { status: "done" },
          d: { status: "pending" },
        },
      ),
    ).toBe(75);
  });

  it("returns 100 when every subsection is done", () => {
    expect(
      actionsPct(
        [{ action_key: "a" }, { action_key: "b" }],
        {
          a: { status: "done" },
          b: { status: "done" },
        },
      ),
    ).toBe(100);
  });

  it("does NOT count blocked or not_applicable as done", () => {
    expect(
      actionsPct(
        [{ action_key: "a" }, { action_key: "b" }],
        {
          a: { status: "blocked" },
          b: { status: "not_applicable" },
        },
      ),
    ).toBe(0);
  });

  it("rounds 1/3 down to 33", () => {
    expect(
      actionsPct(
        [{ action_key: "a" }, { action_key: "b" }, { action_key: "c" }],
        {
          a: { status: "done" },
          b: { status: "pending" },
          c: { status: "pending" },
        },
      ),
    ).toBe(33);
  });
});

describe("Actions pill visibility — derived from template bindings", () => {
  // Mirrors the `hasActionBindings = templateActions.length > 0` guard
  // inside ServiceDetailClient. Templates with zero bindings (Trust /
  // Domestic Co) keep the 5-step bar; ≥1 binding adds the 6th step.
  function hasActionBindings(templateActions: { action_key: string }[]): boolean {
    return templateActions.length > 0;
  }

  it("returns false for templates with no bindings", () => {
    expect(hasActionBindings([])).toBe(false);
  });

  it("returns true for a template with a single binding", () => {
    expect(hasActionBindings([{ action_key: "substance_review" }])).toBe(true);
  });

  it("returns true regardless of which subset of actions is bound", () => {
    expect(
      hasActionBindings([{ action_key: "fsc_checklist" }]),
    ).toBe(true);
    expect(
      hasActionBindings([
        { action_key: "substance_review" },
        { action_key: "company_registration" },
      ]),
    ).toBe(true);
  });
});
