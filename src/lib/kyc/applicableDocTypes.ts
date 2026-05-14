// B-115 — shared filter for the doc-types-required denominator.
//
// `document_types.applies_to` is one of 'individual' | 'organisation' |
// 'both'. The KYC % / Pending compute helpers count every active
// person-scope doc type as required; that overcounts for org profiles
// (they don't need Driving Licence, National ID Card, etc.) and for
// individual profiles when org-only types are added.
//
// Structural input so this can wrap full `DocumentType` rows from
// `calcKycPct` and the trimmed `{ id, name, applies_to }` shape that
// the per-profile pending helper receives. Legacy rows without an
// `applies_to` value pass through — we don't want to silently hide
// types that haven't been categorised yet.

export interface DocTypeWithAppliesTo {
  applies_to?: string | null;
}

export function filterDocTypesForRecordType<T extends DocTypeWithAppliesTo>(
  docTypes: T[],
  recordType: string | null | undefined,
): T[] {
  const want = recordType === "organisation" ? "organisation" : "individual";
  return docTypes.filter((dt) => {
    const a = dt.applies_to;
    if (!a) return true;
    return a === want || a === "both";
  });
}
