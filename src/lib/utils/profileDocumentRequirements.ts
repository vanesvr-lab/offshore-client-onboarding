import type {
  RoleDocumentRequirement,
  DueDiligenceRequirement,
  DueDiligenceLevel,
  DocumentRecord,
} from "@/types";

/** Which requirement levels apply cumulatively to each DD level */
const LEVEL_INCLUDES: Record<DueDiligenceLevel, string[]> = {
  sdd: ["basic", "sdd"],
  cdd: ["basic", "sdd", "cdd"],
  edd: ["basic", "sdd", "cdd", "edd"],
};

export interface DocumentItem {
  document_type_id: string;
  label: string;
}

export interface ProfileDocumentDelta {
  required: DocumentItem[];
  uploaded: DocumentItem[];
  missing: DocumentItem[];
}

/**
 * Returns the required, uploaded, and missing documents for a profile
 * based on their roles and DD level. Never returns duplicates.
 */
export function getRequiredDocumentsForProfile(
  profileRoles: string[],
  roleDocRequirements: RoleDocumentRequirement[],
  ddLevel: DueDiligenceLevel,
  ddRequirements: DueDiligenceRequirement[],
  existingDocuments: DocumentRecord[]
): ProfileDocumentDelta {
  // 1. Collect from role_document_requirements for all the profile's roles
  const roleDocTypeIds = new Set<string>();
  const labelMap = new Map<string, string>();

  for (const req of roleDocRequirements) {
    if (profileRoles.includes(req.role) && req.document_type_id) {
      roleDocTypeIds.add(req.document_type_id);
      if (req.document_types?.name) {
        labelMap.set(req.document_type_id, req.document_types.name);
      }
    }
  }

  // 2. Collect from due_diligence_requirements for the DD level (cumulative)
  const levels = LEVEL_INCLUDES[ddLevel] ?? ["basic"];
  for (const req of ddRequirements) {
    if (
      levels.includes(req.level) &&
      req.requirement_type === "document" &&
      req.document_type_id
    ) {
      roleDocTypeIds.add(req.document_type_id);
      if (!labelMap.has(req.document_type_id)) {
        labelMap.set(req.document_type_id, req.label);
      }
    }
  }

  // 3. Build required list preserving order (role reqs first, then DD reqs)
  const required: DocumentItem[] = Array.from(roleDocTypeIds).map((id) => ({
    document_type_id: id,
    label: labelMap.get(id) ?? id,
  }));

  // 4. Check which are already uploaded
  const uploadedTypeIds = new Set(
    existingDocuments
      .filter((d) => d.is_active !== false)
      .map((d) => d.document_type_id)
  );

  const uploaded = required.filter((r) => uploadedTypeIds.has(r.document_type_id));
  const missing = required.filter((r) => !uploadedTypeIds.has(r.document_type_id));

  return { required, uploaded, missing };
}

/**
 * Returns the profile's effective DD level:
 * profile-level if set, otherwise the account-level default.
 */
export function getEffectiveDdLevel(
  profileLevel: DueDiligenceLevel | null,
  accountLevel: DueDiligenceLevel
): DueDiligenceLevel {
  return profileLevel ?? accountLevel;
}
