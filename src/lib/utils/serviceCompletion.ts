import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import { visibleFields, type KycSection } from "@/lib/kyc/sections";

export type SectionCompletion = {
  percentage: number;
  ragStatus: "green" | "amber" | "red";
};

function toRag(pct: number): "green" | "amber" | "red" {
  if (pct >= 100) return "green";
  if (pct >= 50) return "amber";
  return "red";
}

export function calcServiceDetailsCompletion(
  serviceFields: ServiceField[],
  serviceDetails: Record<string, unknown>
): SectionCompletion {
  const required = serviceFields.filter((f) => f.required);
  if (required.length === 0) {
    const anyFilled = serviceFields.some((f) => {
      const v = serviceDetails[f.key];
      if (Array.isArray(v)) return v.some((x) => x != null && x !== "");
      return v != null && v !== "";
    });
    const pct = serviceFields.length === 0 ? 100 : anyFilled ? 100 : 0;
    return { percentage: pct, ragStatus: toRag(pct) };
  }
  const filled = required.filter((f) => {
    const v = serviceDetails[f.key];
    if (Array.isArray(v)) return v.some((x) => x != null && x !== "");
    return v != null && v !== "";
  });
  const pct = Math.round((filled.length / required.length) * 100);
  return { percentage: pct, ragStatus: toRag(pct) };
}

export function calcDocumentsCompletion(
  documents: { verification_status: string }[]
): SectionCompletion {
  if (documents.length === 0) return { percentage: 0, ragStatus: "red" };
  const verified = documents.filter((d) => d.verification_status === "verified").length;
  const flagged = documents.filter(
    (d) => d.verification_status === "flagged" || d.verification_status === "rejected"
  ).length;
  if (flagged > 0) return { percentage: Math.round((verified / documents.length) * 100), ragStatus: "amber" };
  const pct = Math.round((verified / documents.length) * 100);
  return { percentage: pct, ragStatus: pct === 100 ? "green" : "amber" };
}

export function calcPeopleCompletion(
  persons: { role: string; shareholding_percentage: number | null }[]
): SectionCompletion {
  if (persons.length === 0) return { percentage: 0, ragStatus: "red" };
  const hasDirector = persons.some((p) => p.role === "director");
  const shareholders = persons.filter((p) => p.role === "shareholder");
  const totalShares = shareholders.reduce((sum, p) => sum + (p.shareholding_percentage ?? 0), 0);
  const shareholdingOk = shareholders.length === 0 || totalShares >= 95;

  if (hasDirector && shareholdingOk) return { percentage: 100, ragStatus: "green" };
  if (!hasDirector && shareholders.length === 0) return { percentage: 0, ragStatus: "red" };
  return { percentage: 50, ragStatus: "amber" };
}

export function calcKycCompletion(
  persons: {
    client_profiles: {
      client_profile_kyc: Record<string, unknown> | null;
    } | null;
  }[]
): SectionCompletion {
  if (persons.length === 0) return { percentage: 0, ragStatus: "red" };

  const KYC_FIELDS = [
    "date_of_birth", "nationality", "passport_number", "passport_expiry",
    "occupation", "address", "source_of_funds_description", "source_of_wealth_description",
    "is_pep", "legal_issues_declared",
  ];

  let totalPct = 0;
  for (const person of persons) {
    const kyc = person.client_profiles?.client_profile_kyc;
    if (!kyc) {
      // no kyc at all = 0%
      continue;
    }
    const filled = KYC_FIELDS.filter((f) => {
      const v = kyc[f];
      return v !== null && v !== undefined && v !== "";
    }).length;
    totalPct += (filled / KYC_FIELDS.length) * 100;
  }
  const pct = Math.round(totalPct / persons.length);
  return { percentage: pct, ragStatus: toRag(pct) };
}

// Section matchers mirroring ServiceWizard step routing
const SECTION_MATCHERS: Record<string, (section: string | undefined) => boolean> = {
  company_setup: (s) => !s || s === "Details" || /company\s*setup/i.test(s) || /company/i.test(s),
  financial: (s) => !!s && /financial|finance/i.test(s),
  banking: (s) => !!s && /bank/i.test(s),
};

export function calcSectionCompletion(
  serviceFields: ServiceField[],
  serviceDetails: Record<string, unknown>,
  sectionKey: "company_setup" | "financial" | "banking"
): SectionCompletion {
  const matcher = SECTION_MATCHERS[sectionKey];
  const fields = serviceFields.filter((f) => matcher(f.section));
  if (fields.length === 0) return { percentage: 100, ragStatus: "green" };
  const required = fields.filter((f) => f.required);
  if (required.length === 0) {
    const anyFilled = fields.some((f) => {
      const v = serviceDetails[f.key];
      return Array.isArray(v) ? v.some((x) => x != null && x !== "") : v != null && v !== "";
    });
    const pct = anyFilled ? 100 : 0;
    return { percentage: pct, ragStatus: toRag(pct) };
  }
  const filled = required.filter((f) => {
    const v = serviceDetails[f.key];
    return Array.isArray(v) ? v.some((x) => x != null && x !== "") : v != null && v !== "";
  }).length;
  const pct = Math.round((filled / required.length) * 100);
  return { percentage: pct, ragStatus: toRag(pct) };
}

/**
 * Required-only completion % for a single KYC subsection (Identity, Financial
 * Profile, Declarations, Company Details, Tax & Financial). Mirrors the
 * service-section convention (`calcSectionCompletion`):
 *   - Counts only fields marked `required: true` and currently visible after
 *     `showWhen` gating (e.g. "Please specify" only when Source of funds = Other).
 *   - Returns 0 when the subsection has zero required visible fields, to match
 *     "nothing is mandatory yet" rather than "everything is done".
 *   - Required field with array value uses `v.some(x => x != null && x !== "")`,
 *     matching B-086's array-emptiness convention.
 *
 * DD-level gating (`cddOrAbove` / `eddOnly`) is the caller's job — pass a
 * section already filtered via `gateSectionForLevel`.
 */
export function calcKycSectionRequiredPct(
  section: KycSection,
  values: Record<string, unknown>
): SectionCompletion {
  const visible = visibleFields(section.fields, values);
  const required = visible.filter((f) => f.required);
  if (required.length === 0) return { percentage: 0, ragStatus: "red" };
  const filled = required.filter((f) => {
    const v = values[f.key];
    if (Array.isArray(v)) return v.some((x) => x != null && x !== "");
    return v != null && v !== "";
  }).length;
  const pct = Math.round((filled / required.length) * 100);
  return { percentage: pct, ragStatus: toRag(pct) };
}

export function calcOverallCompletion(sections: SectionCompletion[]): SectionCompletion {
  if (sections.length === 0) return { percentage: 0, ragStatus: "red" };
  const avg = Math.round(sections.reduce((sum, s) => sum + s.percentage, 0) / sections.length);
  return { percentage: avg, ragStatus: toRag(avg) };
}
