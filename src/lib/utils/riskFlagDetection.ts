import type { KycRecord, DueDiligenceLevel, RiskFlag } from "@/types";

// FATF high-risk and gray-list jurisdictions (simplified)
const HIGH_RISK_JURISDICTIONS = new Set([
  // Black list (FATF call to action)
  "iran", "north korea", "myanmar", "syria", "yemen",
  // Notable high-risk
  "cuba", "libya", "haiti",
  // Commonly watched
  "russia", "ukraine", "afghanistan", "venezuela", "belarus",
  // Common nationality codes / names
  "ir", "kp", "mm", "sy", "ye", "cu",
]);

function isHighRiskJurisdiction(value: string | null | undefined): boolean {
  if (!value) return false;
  return HIGH_RISK_JURISDICTIONS.has(value.trim().toLowerCase());
}

function passportExpiryMonths(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate).getTime();
  const now = Date.now();
  return (exp - now) / (1000 * 60 * 60 * 24 * 30);
}

export function detectRiskFlags(
  kycRecord: KycRecord,
  currentLevel: DueDiligenceLevel
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const now = new Date().toISOString();

  // PEP declared but not on EDD
  if (kycRecord.is_pep === true && currentLevel !== "edd") {
    flags.push({
      type: "pep_not_edd",
      message: "Client declared PEP status — consider upgrading to EDD",
      severity: "critical",
      suggestedAction: "upgrade_to_edd",
      detectedAt: now,
      dismissed: false,
      dismissedReason: null,
    });
  }

  // Legal issues declared but on SDD
  if (kycRecord.legal_issues_declared === true && currentLevel === "sdd") {
    flags.push({
      type: "legal_issues_sdd",
      message: "Client declared legal issues — consider upgrading to CDD or EDD",
      severity: "warning",
      suggestedAction: "upgrade_to_cdd",
      detectedAt: now,
      dismissed: false,
      dismissedReason: null,
    });
  }

  // High-risk nationality
  if (isHighRiskJurisdiction(kycRecord.nationality)) {
    flags.push({
      type: "high_risk_nationality",
      message: `High-risk jurisdiction detected: ${kycRecord.nationality}`,
      severity: "warning",
      suggestedAction: "review_geographic_risk",
      detectedAt: now,
      dismissed: false,
      dismissedReason: null,
    });
  }

  // High-risk passport country (if different from nationality)
  if (
    kycRecord.passport_country &&
    kycRecord.passport_country !== kycRecord.nationality &&
    isHighRiskJurisdiction(kycRecord.passport_country)
  ) {
    flags.push({
      type: "high_risk_passport_country",
      message: `High-risk passport country detected: ${kycRecord.passport_country}`,
      severity: "warning",
      suggestedAction: "review_geographic_risk",
      detectedAt: now,
      dismissed: false,
      dismissedReason: null,
    });
  }

  // Passport expiring soon (< 6 months)
  const monthsToExpiry = passportExpiryMonths(kycRecord.passport_expiry);
  if (monthsToExpiry !== null && monthsToExpiry > 0 && monthsToExpiry < 6) {
    flags.push({
      type: "passport_expiring",
      message: `Passport expires in ${Math.round(monthsToExpiry)} months — request renewal copy`,
      severity: "info",
      suggestedAction: "request_new_passport",
      detectedAt: now,
      dismissed: false,
      dismissedReason: null,
    });
  }

  // Passport already expired
  if (monthsToExpiry !== null && monthsToExpiry <= 0) {
    flags.push({
      type: "passport_expired",
      message: "Passport has expired — client must provide a renewed document",
      severity: "critical",
      suggestedAction: "request_new_passport",
      detectedAt: now,
      dismissed: false,
      dismissedReason: null,
    });
  }

  return flags;
}

/**
 * Merge newly detected flags into an existing flags array.
 * Does not add duplicates (matched by `type`), preserves dismissed state.
 */
export function mergeRiskFlags(
  existing: RiskFlag[],
  newFlags: RiskFlag[]
): RiskFlag[] {
  const result = [...existing];
  for (const flag of newFlags) {
    const alreadyExists = result.some((f) => f.type === flag.type);
    if (!alreadyExists) {
      result.push(flag);
    }
  }
  return result;
}
