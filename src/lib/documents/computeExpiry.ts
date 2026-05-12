// B-097 — single source of truth for "is this document still valid?".
//
// Resolution order:
//   1. documents.expiry_date (manual admin override OR OCR-extracted, e.g. passport)
//   2. document_types.valid_for_months computed against documents.uploaded_at
//   3. Never expires
//
// Never store the result. Always compute at display time so changes to
// `valid_for_months` flow through without a migration.

export type ExpiryStatus = "valid" | "expired" | "never_expires";

export interface DocumentExpiryInfo {
  expiresAt: Date | null; // null when never_expires
  status: ExpiryStatus;
  source: "manual" | "valid_for_months" | "never";
}

export function computeDocumentExpiry(
  doc: { expiry_date: string | null; uploaded_at: string },
  type: { valid_for_months: number | null } | null,
  now: Date = new Date(),
): DocumentExpiryInfo {
  if (doc.expiry_date) {
    const expiresAt = new Date(doc.expiry_date);
    return {
      expiresAt,
      status: expiresAt < now ? "expired" : "valid",
      source: "manual",
    };
  }

  if (type?.valid_for_months != null) {
    const uploaded = new Date(doc.uploaded_at);
    const expiresAt = new Date(uploaded);
    expiresAt.setMonth(expiresAt.getMonth() + type.valid_for_months);
    return {
      expiresAt,
      status: expiresAt < now ? "expired" : "valid",
      source: "valid_for_months",
    };
  }

  return { expiresAt: null, status: "never_expires", source: "never" };
}
