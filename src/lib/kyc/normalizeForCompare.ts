// B-117 — Field-level mismatch detection between the admin KYC form value
// and the OCR-extracted value. Each `KycField.type` has its own equality
// notion (text is whitespace/case-insensitive, dates compare on YYYY-MM-DD,
// countries compare on ISO-3, …). All helpers are pure so the marker can
// re-derive match state on every render.

import { toIso3 } from "@/lib/constants/countries";
import type { KycFieldType } from "@/lib/kyc/sections";

export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.every((v) => isEmpty(v));
  return false;
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/\s+/g, " ");
  if (s.length === 0) return null;
  return s.toLowerCase();
}

function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw.length === 0) return null;
  // Already ISO YYYY-MM-DD (possibly with time/Z suffix)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // Try Date parser (handles US 05/25/1978, etc.) — guard against Invalid.
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeCountry(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw.length === 0) return null;
  const iso = toIso3(raw);
  return iso ?? raw.toLowerCase();
}

function normalizeBoolean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  const raw = String(value).trim().toLowerCase();
  if (raw.length === 0) return null;
  if (raw === "yes" || raw === "true" || raw === "1") return "true";
  if (raw === "no" || raw === "false" || raw === "0") return "false";
  return raw;
}

export function normalizeForCompare(
  value: unknown,
  type: KycFieldType | undefined,
): string | null {
  switch (type) {
    case "date":
      return normalizeDate(value);
    case "country":
      return normalizeCountry(value);
    case "boolean":
      return normalizeBoolean(value);
    case "select":
    case "text":
    case "textarea":
    default:
      return normalizeText(value);
  }
}

export function valuesMatch(
  a: unknown,
  b: unknown,
  type: KycFieldType | undefined,
): boolean {
  const na = normalizeForCompare(a, type);
  const nb = normalizeForCompare(b, type);
  if (na === null || nb === null) return false;
  return na === nb;
}
