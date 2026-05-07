// B-076 — KYC document category labels + ordering. Lifted from the
// client wizard so the admin per-profile view can render the same
// `IDENTITY DOCUMENTS` / `FINANCIAL DOCUMENTS` / etc. headings.

export const KYC_CATEGORY_LABELS: Record<string, string> = {
  identity: "Identity",
  financial: "Financial",
  compliance: "Compliance",
  additional: "Additional",
  professional: "Professional",
  tax: "Tax",
  adverse_media: "Adverse Media",
  wealth: "Wealth",
};

export function kycCategoryLabel(cat: string): string {
  return (
    KYC_CATEGORY_LABELS[cat] ??
    cat
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}

/** Stable display order for category groupings. Unknown categories
 *  fall to the end in their natural order. */
export const KYC_CATEGORY_ORDER = [
  "identity",
  "financial",
  "compliance",
  "professional",
  "tax",
  "adverse_media",
  "wealth",
  "additional",
] as const;

export function sortKycCategories(present: string[]): string[] {
  const ordered = (KYC_CATEGORY_ORDER as readonly string[]).filter((c) =>
    present.includes(c),
  );
  const extras = present.filter(
    (c) => !(KYC_CATEGORY_ORDER as readonly string[]).includes(c),
  );
  return [...ordered, ...extras];
}
