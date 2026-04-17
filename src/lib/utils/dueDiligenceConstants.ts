import type { DueDiligenceLevel } from "@/types";

/**
 * Cumulative DD levels: each level includes requirements from all lower levels.
 * EDD requires everything CDD requires, which requires everything SDD requires.
 */
export const DD_LEVEL_INCLUDES: Record<DueDiligenceLevel, ("basic" | "sdd" | "cdd" | "edd")[]> = {
  sdd: ["basic", "sdd"],
  cdd: ["basic", "sdd", "cdd"],
  edd: ["basic", "sdd", "cdd", "edd"],
};

/**
 * Default section name per DD level for display in compliance score breakdown.
 */
export const DD_SECTION_FOR_LEVEL: Record<string, string> = {
  basic: "Identity",
  sdd: "Financial",
  cdd: "Financial",
  edd: "Financial",
};
