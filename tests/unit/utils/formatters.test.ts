import { describe, it, expect } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatFileSize,
  formatActionLabel,
} from "@/lib/utils/formatters";

describe("formatDate", () => {
  it("returns em-dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("returns em-dash for empty string", () => {
    expect(formatDate("")).toBe("—");
  });

  it("formats a valid ISO datetime as DD MMM YYYY (en-GB)", () => {
    // Use noon UTC so timezone shift can't move the date by a day.
    expect(formatDate("2026-04-21T12:00:00Z")).toMatch(/^21 Apr 2026$/);
  });
});

describe("formatDateTime", () => {
  it("returns em-dash for null", () => {
    expect(formatDateTime(null)).toBe("—");
  });

  it("includes the day, month, year, hour, and minute", () => {
    const out = formatDateTime("2026-04-21T13:45:00Z");
    expect(out).toMatch(/21 Apr 2026/);
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
});

describe("formatFileSize", () => {
  it("returns em-dash for null/undefined/0", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(undefined)).toBe("—");
    expect(formatFileSize(0)).toBe("—");
  });

  it("formats bytes < 1 KB", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats KB", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats MB", () => {
    expect(formatFileSize(1024 * 1024 * 5)).toBe("5.0 MB");
  });
});

describe("formatActionLabel", () => {
  it("title-cases snake_case inputs", () => {
    expect(formatActionLabel("status_changed")).toBe("Status Changed");
    expect(formatActionLabel("document_uploaded")).toBe("Document Uploaded");
  });

  it("handles single-word actions", () => {
    expect(formatActionLabel("created")).toBe("Created");
  });

  it("handles empty input", () => {
    expect(formatActionLabel("")).toBe("");
  });
});
