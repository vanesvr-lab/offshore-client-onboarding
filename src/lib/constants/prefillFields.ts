export const KYC_PREFILLABLE_FIELDS = [
  "full_name",
  "date_of_birth",
  "nationality",
  "passport_country",
  "passport_number",
  "passport_expiry",
  "address",
  // B-049 — structured residential-address fields filled from POA extraction.
  "address_line_1",
  "address_line_2",
  "address_city",
  "address_state",
  "address_postal_code",
  "address_country",
  "occupation",
  "tax_identification_number",
  "jurisdiction_tax_residence",
] as const;

export type KycPrefillableField = (typeof KYC_PREFILLABLE_FIELDS)[number];

export function isKycPrefillableField(value: unknown): value is KycPrefillableField {
  return typeof value === "string" && (KYC_PREFILLABLE_FIELDS as readonly string[]).includes(value);
}
