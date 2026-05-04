import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { detectRiskFlags, mergeRiskFlags } from "@/lib/utils/riskFlagDetection";
import type { KycRecord, RiskFlag } from "@/types";

function record(overrides: Partial<KycRecord> = {}): KycRecord {
  return {
    is_pep: null,
    legal_issues_declared: null,
    nationality: null,
    passport_country: null,
    passport_expiry: null,
    ...overrides,
  } as unknown as KycRecord;
}

describe("detectRiskFlags", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clean record + sdd → no flags (no false positives)", () => {
    const flags = detectRiskFlags(record({ nationality: "MU", passport_country: "MU" }), "sdd");
    expect(flags).toEqual([]);
  });

  it("PEP=true on cdd → pep_not_edd critical flag", () => {
    const flags = detectRiskFlags(record({ is_pep: true }), "cdd");
    expect(flags.some((f) => f.type === "pep_not_edd" && f.severity === "critical")).toBe(true);
  });

  it("PEP=true on edd → no pep flag (already on highest level)", () => {
    const flags = detectRiskFlags(record({ is_pep: true }), "edd");
    expect(flags.some((f) => f.type === "pep_not_edd")).toBe(false);
  });

  it("legal_issues + sdd → legal_issues_sdd warning", () => {
    const flags = detectRiskFlags(record({ legal_issues_declared: true }), "sdd");
    expect(flags.some((f) => f.type === "legal_issues_sdd" && f.severity === "warning")).toBe(true);
  });

  it("legal_issues + cdd → no legal flag", () => {
    const flags = detectRiskFlags(record({ legal_issues_declared: true }), "cdd");
    expect(flags.some((f) => f.type === "legal_issues_sdd")).toBe(false);
  });

  it("high-risk nationality (Iran) → high_risk_nationality flag", () => {
    const flags = detectRiskFlags(record({ nationality: "Iran" }), "sdd");
    expect(flags.some((f) => f.type === "high_risk_nationality")).toBe(true);
  });

  it("high-risk passport country different from nationality → high_risk_passport_country flag", () => {
    const flags = detectRiskFlags(
      record({ nationality: "MU", passport_country: "Cuba" }),
      "sdd",
    );
    expect(flags.some((f) => f.type === "high_risk_passport_country")).toBe(true);
  });

  it("high-risk passport country equal to nationality → no separate passport flag", () => {
    const flags = detectRiskFlags(
      record({ nationality: "Iran", passport_country: "Iran" }),
      "sdd",
    );
    expect(flags.some((f) => f.type === "high_risk_passport_country")).toBe(false);
    // Nationality flag still present
    expect(flags.some((f) => f.type === "high_risk_nationality")).toBe(true);
  });

  it("passport expiring within 6 months → passport_expiring info flag", () => {
    // ~3 months from system time
    const flags = detectRiskFlags(record({ passport_expiry: "2026-08-04" }), "sdd");
    const f = flags.find((x) => x.type === "passport_expiring");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("info");
  });

  it("expired passport → passport_expired critical flag", () => {
    const flags = detectRiskFlags(record({ passport_expiry: "2020-01-01" }), "sdd");
    const f = flags.find((x) => x.type === "passport_expired");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("critical");
  });

  it("passport with comfortable expiry → no expiry flag", () => {
    const flags = detectRiskFlags(record({ passport_expiry: "2030-01-01" }), "sdd");
    expect(flags.some((f) => f.type.startsWith("passport_"))).toBe(false);
  });
});

describe("mergeRiskFlags", () => {
  function flag(type: string, dismissed = false): RiskFlag {
    return {
      type,
      message: type,
      severity: "info",
      suggestedAction: null,
      detectedAt: "2026-01-01T00:00:00Z",
      dismissed,
      dismissedReason: null,
    };
  }

  it("appends new flags by type", () => {
    const merged = mergeRiskFlags([flag("a")], [flag("b")]);
    expect(merged.map((f) => f.type)).toEqual(["a", "b"]);
  });

  it("does not duplicate by type", () => {
    const merged = mergeRiskFlags([flag("a")], [flag("a")]);
    expect(merged).toHaveLength(1);
  });

  it("preserves dismissed state on existing flags", () => {
    const existing = flag("a", true);
    const merged = mergeRiskFlags([existing], [flag("a")]);
    expect(merged[0].dismissed).toBe(true);
  });
});
