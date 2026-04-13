import type {
  KycRecord,
  DocumentRecord,
  DueDiligenceLevel,
  DueDiligenceRequirement,
  ComplianceScore,
  SectionScore,
} from "@/types";

/** Which requirement levels apply cumulatively to each DD level */
const LEVEL_INCLUDES: Record<DueDiligenceLevel, ("basic" | "sdd" | "cdd" | "edd")[]> = {
  sdd: ["basic", "sdd"],
  cdd: ["basic", "sdd", "cdd"],
  edd: ["basic", "sdd", "cdd", "edd"],
};

const SECTION_FOR_LEVEL: Record<string, string> = {
  basic: "Identity",
  sdd: "Financial",
  cdd: "Financial",
  edd: "Financial",
};

function reqSection(req: DueDiligenceRequirement): string {
  if (req.requirement_type === "admin_check") return "Admin Checks";
  if (req.level === "basic") return "Identity";
  if (req.level === "cdd" && (req.requirement_key === "is_pep" || req.requirement_key === "legal_issues_declared" || req.requirement_key === "tax_identification_number")) return "Declarations";
  if (req.level === "edd" && (req.requirement_key === "relationship_history" || req.requirement_key === "geographic_risk_assessment")) return "Declarations";
  return SECTION_FOR_LEVEL[req.level] ?? "Other";
}

function isFieldMet(kycRecord: KycRecord, key: string): boolean {
  const val = (kycRecord as unknown as Record<string, unknown>)[key];
  if (val === null || val === undefined) return false;
  if (val === "") return false;
  if (typeof val === "boolean") return val !== null;
  return true;
}

function isDocumentMet(documents: DocumentRecord[], req: DueDiligenceRequirement): boolean {
  if (!req.document_type_id) return false;
  return documents.some(
    (d) =>
      d.document_type_id === req.document_type_id &&
      d.is_active !== false
  );
}

function isAdminCheckMet(kycRecord: KycRecord, key: string): boolean {
  const record = kycRecord as unknown as Record<string, unknown>;
  switch (key) {
    case "sanctions_checked":
      return record.sanctions_checked === true;
    case "pep_verified":
      return record.pep_verified === true;
    case "adverse_media_checked":
      return record.adverse_media_checked === true;
    case "risk_rating":
      return record.risk_rating !== null && record.risk_rating !== undefined && record.risk_rating !== "";
    case "senior_management_approval":
      return record.senior_management_approval === true;
    case "ongoing_monitoring_plan":
      return !!(record.ongoing_monitoring_plan as string | null)?.trim();
    default:
      return false;
  }
}

export function calculateComplianceScore(
  kycRecord: KycRecord,
  documents: DocumentRecord[],
  dueDiligenceLevel: DueDiligenceLevel,
  requirements: DueDiligenceRequirement[]
): ComplianceScore {
  const includedLevels = LEVEL_INCLUDES[dueDiligenceLevel];
  const applicable = requirements.filter((r) =>
    (includedLevels as string[]).includes(r.level)
  );

  // Group into sections
  const sectionMap: Record<string, { req: DueDiligenceRequirement; met: boolean }[]> = {};
  for (const req of applicable) {
    const section = reqSection(req);
    if (!sectionMap[section]) sectionMap[section] = [];

    let met = false;
    if (req.requirement_type === "field") {
      met = isFieldMet(kycRecord, req.requirement_key);
    } else if (req.requirement_type === "document") {
      met = isDocumentMet(documents, req);
    } else if (req.requirement_type === "admin_check") {
      met = isAdminCheckMet(kycRecord, req.requirement_key);
    }

    sectionMap[section].push({ req, met });
  }

  const SECTION_ORDER = ["Identity", "Financial", "Declarations", "Admin Checks"];

  const sections: SectionScore[] = SECTION_ORDER.filter((s) => sectionMap[s])
    .map((s) => {
      const items = sectionMap[s];
      return {
        name: s,
        filled: items.filter((i) => i.met).length,
        total: items.length,
        items: items.map((i) => ({
          key: i.req.requirement_key,
          label: i.req.label,
          met: i.met,
        })),
      };
    });

  const totalFilled = sections.reduce((sum, s) => sum + s.filled, 0);
  const totalItems = sections.reduce((sum, s) => sum + s.total, 0);
  const overallPercentage = totalItems > 0 ? Math.round((totalFilled / totalItems) * 100) : 0;

  const blockers = sections
    .flatMap((s) => s.items.filter((i) => !i.met).map((i) => i.label));

  return {
    overallPercentage,
    sections,
    canApprove: blockers.length === 0,
    blockers,
  };
}
