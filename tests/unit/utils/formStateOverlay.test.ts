import { describe, it, expect } from "vitest";
import { composeFormState, reconcileOverlay } from "@/lib/utils/formStateOverlay";

describe("composeFormState", () => {
  it("returns server data when overlay is empty", () => {
    const server = { address_line_1: "Server St", address_city: "Server City" };
    expect(composeFormState(server, {})).toEqual(server);
  });

  it("overlays user edits over server data", () => {
    const server = { address_line_1: "Server St", address_city: "Server City" };
    const overlay = { address_line_1: "User St" };
    expect(composeFormState(server, overlay)).toEqual({
      address_line_1: "User St",
      address_city: "Server City",
    });
  });

  it("does not mutate inputs", () => {
    const server = { x: 1 };
    const overlay = { x: 2 };
    composeFormState(server, overlay);
    expect(server).toEqual({ x: 1 });
    expect(overlay).toEqual({ x: 2 });
  });
});

describe("reconcileOverlay", () => {
  it("drops overlay entries that match server", () => {
    const server = { a: "x", b: "y" };
    const overlay = { a: "x", b: "z" };
    expect(reconcileOverlay(server, overlay)).toEqual({ b: "z" });
  });

  it("returns same reference when nothing reconciles", () => {
    const server = { a: "x" };
    const overlay = { a: "y" };
    const out = reconcileOverlay(server, overlay);
    expect(out).toBe(overlay);
  });

  it("handles empty overlay", () => {
    expect(reconcileOverlay({ a: "x" }, {})).toEqual({});
  });

  it("handles all entries reconciling", () => {
    const server = { a: "x", b: "y" };
    const overlay = { a: "x", b: "y" };
    const out = reconcileOverlay(server, overlay);
    expect(out).toEqual({});
    expect(out).not.toBe(overlay);
  });
});
