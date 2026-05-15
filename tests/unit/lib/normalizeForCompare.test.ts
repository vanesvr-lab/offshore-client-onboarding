import { describe, it, expect } from "vitest";
import {
  isEmpty,
  normalizeForCompare,
  valuesMatch,
} from "@/lib/kyc/normalizeForCompare";

describe("isEmpty", () => {
  it("treats null/undefined as empty", () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });
  it("treats empty/whitespace strings as empty", () => {
    expect(isEmpty("")).toBe(true);
    expect(isEmpty("   ")).toBe(true);
    expect(isEmpty("\t\n  ")).toBe(true);
  });
  it("treats arrays-of-empties as empty", () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([null, "", undefined])).toBe(true);
    expect(isEmpty(["x"])).toBe(false);
  });
  it("treats non-empty values as non-empty", () => {
    expect(isEmpty("a")).toBe(false);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
  });
});

describe("normalizeForCompare — text", () => {
  it("lowercases and trims", () => {
    expect(normalizeForCompare("  John Doe  ", "text")).toBe("john doe");
  });
  it("collapses internal whitespace", () => {
    expect(normalizeForCompare("John   Doe", "text")).toBe("john doe");
    expect(normalizeForCompare("John\tDoe", "text")).toBe("john doe");
  });
  it("returns null for empty / whitespace", () => {
    expect(normalizeForCompare("", "text")).toBe(null);
    expect(normalizeForCompare("   ", "text")).toBe(null);
    expect(normalizeForCompare(null, "text")).toBe(null);
  });
  it("falls back to text for unknown types", () => {
    expect(normalizeForCompare("Hello", undefined)).toBe("hello");
  });
});

describe("normalizeForCompare — date", () => {
  it("normalizes US-style dates to ISO", () => {
    expect(normalizeForCompare("05/25/1978", "date")).toBe("1978-05-25");
  });
  it("preserves ISO-formatted dates", () => {
    expect(normalizeForCompare("1978-05-25", "date")).toBe("1978-05-25");
  });
  it("strips time component from ISO datetimes", () => {
    expect(normalizeForCompare("1978-05-25T00:00:00Z", "date")).toBe("1978-05-25");
  });
  it("returns null for unparseable values", () => {
    expect(normalizeForCompare("not a date", "date")).toBe(null);
    expect(normalizeForCompare("", "date")).toBe(null);
  });
});

describe("normalizeForCompare — country", () => {
  it("converts country names to ISO-3", () => {
    expect(normalizeForCompare("Mauritius", "country")).toBe("MUS");
  });
  it("accepts ISO-3 codes as-is", () => {
    expect(normalizeForCompare("MUS", "country")).toBe("MUS");
    expect(normalizeForCompare("mus", "country")).toBe("MUS");
  });
  it("handles legacy aliases", () => {
    expect(normalizeForCompare("Mauritian", "country")).toBe("MUS");
  });
  it("returns null for empty input", () => {
    expect(normalizeForCompare("", "country")).toBe(null);
    expect(normalizeForCompare(null, "country")).toBe(null);
  });
});

describe("normalizeForCompare — boolean", () => {
  it("normalizes true/false primitives", () => {
    expect(normalizeForCompare(true, "boolean")).toBe("true");
    expect(normalizeForCompare(false, "boolean")).toBe("false");
  });
  it("normalizes yes/no strings", () => {
    expect(normalizeForCompare("yes", "boolean")).toBe("true");
    expect(normalizeForCompare("NO", "boolean")).toBe("false");
  });
});

describe("valuesMatch", () => {
  it("matches whitespace-different text values", () => {
    expect(valuesMatch("John Doe", "  john   doe  ", "text")).toBe(true);
  });
  it("matches differently-formatted dates", () => {
    expect(valuesMatch("05/25/1978", "1978-05-25", "date")).toBe(true);
  });
  it("matches country name vs ISO-3", () => {
    expect(valuesMatch("Mauritius", "MUS", "country")).toBe(true);
  });
  it("returns false when one side is empty", () => {
    expect(valuesMatch("", "John", "text")).toBe(false);
    expect(valuesMatch(null, "John", "text")).toBe(false);
  });
  it("returns false on actual mismatch", () => {
    expect(valuesMatch("John", "Jane", "text")).toBe(false);
    expect(valuesMatch("1978-05-25", "1979-05-25", "date")).toBe(false);
  });
});
