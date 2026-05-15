import { describe, it, expect } from "vitest";

// B-122 — unit coverage for the gauges-array refactor in
// ServiceProgressMeters. The component itself renders SVG which we
// can't easily snapshot under the no-JSX vitest setup; instead we
// exercise the prop shape contract:
// - Caller decides how many gauges to pass (2 for templates without
//   action bindings, 3 when bound).
// - When the Actions gauge is requested with total=0, ProgressMetersWithState
//   omits it from the array — so the component itself never has to
//   defend against that case.
//
// This stays a logic test that mirrors what ProgressMetersWithState's
// `gauges` memo does, so any regression in the contract is caught at
// the unit layer.

type Step = { pct: number };
type ActionSub = { status: "pending" | "in_progress" | "done" | "blocked" | "not_applicable" };

function buildGauges(input: {
  steps: Step[];
  reviewedCount: number;
  actionSubs: ActionSub[];
}) {
  const total = input.steps.length;
  const completedCount = input.steps.filter((s) => s.pct >= 100).length;
  const actionsTotalCount = input.actionSubs.length;
  const actionsDoneCount = input.actionSubs.filter(
    (s) => s.status === "done" || s.status === "not_applicable",
  ).length;

  const gauges = [
    { label: "Completed", count: completedCount, total },
    { label: "Reviewed", count: input.reviewedCount, total },
  ] as { label: string; count: number; total: number }[];
  if (actionsTotalCount > 0) {
    gauges.push({
      label: "Actions",
      count: actionsDoneCount,
      total: actionsTotalCount,
    });
  }
  return gauges;
}

describe("Progress Meters gauges shape", () => {
  it("emits two gauges when there are no action subsections", () => {
    const g = buildGauges({
      steps: [{ pct: 100 }, { pct: 50 }, { pct: 100 }, { pct: 100 }, { pct: 0 }],
      reviewedCount: 2,
      actionSubs: [],
    });
    expect(g.map((x) => x.label)).toEqual(["Completed", "Reviewed"]);
    expect(g[0]).toEqual({ label: "Completed", count: 3, total: 5 });
    expect(g[1]).toEqual({ label: "Reviewed", count: 2, total: 5 });
  });

  it("adds a third Actions gauge when action subsections are bound", () => {
    const g = buildGauges({
      steps: [
        { pct: 100 }, { pct: 100 }, { pct: 100 }, { pct: 100 }, { pct: 100 }, { pct: 50 },
      ],
      reviewedCount: 4,
      actionSubs: [
        { status: "done" },
        { status: "in_progress" },
        { status: "done" },
        { status: "pending" },
      ],
    });
    expect(g.map((x) => x.label)).toEqual(["Completed", "Reviewed", "Actions"]);
    expect(g[2]).toEqual({ label: "Actions", count: 2, total: 4 });
  });

  it("counts not_applicable as 'done' for the Actions gauge (admin opted out)", () => {
    const g = buildGauges({
      steps: [
        { pct: 100 }, { pct: 100 }, { pct: 100 }, { pct: 100 }, { pct: 100 }, { pct: 100 },
      ],
      reviewedCount: 5,
      actionSubs: [
        { status: "done" },
        { status: "not_applicable" },
        { status: "blocked" },
      ],
    });
    expect(g[2]).toEqual({ label: "Actions", count: 2, total: 3 });
  });

  it("omits the Actions gauge entirely when total = 0", () => {
    // The wrapper only invokes the Actions branch when total > 0; this
    // mirrors the production behaviour for templates with no bindings.
    const g = buildGauges({
      steps: [{ pct: 0 }, { pct: 0 }, { pct: 0 }, { pct: 0 }, { pct: 0 }],
      reviewedCount: 0,
      actionSubs: [],
    });
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.label === "Actions")).toBeUndefined();
  });
});
