import { describe, it, expect } from "vitest";
import {
  getRequiredDocumentsForProfile,
  getEffectiveDdLevel,
} from "@/lib/utils/profileDocumentRequirements";
import type {
  RoleDocumentRequirement,
  DueDiligenceRequirement,
  DocumentRecord,
} from "@/types";

function roleReq(
  role: RoleDocumentRequirement["role"],
  documentTypeId: string,
  name: string,
): RoleDocumentRequirement {
  return {
    id: `role-${role}-${documentTypeId}`,
    role,
    document_type_id: documentTypeId,
    is_required: true,
    sort_order: 1,
    document_types: { id: documentTypeId, name },
  };
}

function ddReq(
  level: DueDiligenceRequirement["level"],
  documentTypeId: string,
  label: string,
): DueDiligenceRequirement {
  return {
    id: `dd-${level}-${documentTypeId}`,
    level,
    requirement_type: "document",
    requirement_key: documentTypeId,
    field_key: null,
    label,
    description: null,
    document_type_id: documentTypeId,
    applies_to: "individual",
    sort_order: 1,
  };
}

function existingDoc(documentTypeId: string, isActive = true): DocumentRecord {
  return {
    id: `doc-${documentTypeId}`,
    document_type_id: documentTypeId,
    is_active: isActive,
  } as unknown as DocumentRecord;
}

describe("getRequiredDocumentsForProfile", () => {
  it("returns empty arrays when no role or DD requirements match", () => {
    const r = getRequiredDocumentsForProfile(
      ["director"],
      [],
      "sdd",
      [],
      [],
    );
    expect(r).toEqual({ required: [], uploaded: [], missing: [] });
  });

  it("collects role-based requirements for matching roles only", () => {
    const r = getRequiredDocumentsForProfile(
      ["director"],
      [
        roleReq("director", "type-1", "Director ID"),
        roleReq("shareholder", "type-2", "Shareholder ID"),
      ],
      "sdd",
      [],
      [],
    );
    expect(r.required.map((d) => d.document_type_id)).toEqual(["type-1"]);
    expect(r.required[0].label).toBe("Director ID");
    expect(r.missing).toHaveLength(1);
    expect(r.uploaded).toHaveLength(0);
  });

  it("adds DD requirements at the chosen level (cumulative)", () => {
    const r = getRequiredDocumentsForProfile(
      ["director"],
      [],
      "cdd",
      [
        ddReq("sdd", "type-sdd", "SDD doc"),
        ddReq("cdd", "type-cdd", "CDD doc"),
        ddReq("edd", "type-edd", "EDD doc"),
      ],
      [],
    );
    const ids = r.required.map((d) => d.document_type_id).sort();
    expect(ids).toEqual(["type-cdd", "type-sdd"].sort());
    expect(ids).not.toContain("type-edd");
  });

  it("dedupes when role and DD requirements name the same document type", () => {
    const r = getRequiredDocumentsForProfile(
      ["director"],
      [roleReq("director", "type-1", "Passport")],
      "sdd",
      [ddReq("sdd", "type-1", "Passport (DD)")],
      [],
    );
    expect(r.required).toHaveLength(1);
    // Role label takes precedence (set first via labelMap)
    expect(r.required[0].label).toBe("Passport");
  });

  it("splits into uploaded vs missing based on existing documents", () => {
    const r = getRequiredDocumentsForProfile(
      ["director"],
      [
        roleReq("director", "type-1", "Doc A"),
        roleReq("director", "type-2", "Doc B"),
      ],
      "sdd",
      [],
      [existingDoc("type-1")],
    );
    expect(r.uploaded.map((d) => d.document_type_id)).toEqual(["type-1"]);
    expect(r.missing.map((d) => d.document_type_id)).toEqual(["type-2"]);
  });

  it("ignores soft-deleted documents (is_active=false)", () => {
    const r = getRequiredDocumentsForProfile(
      ["director"],
      [roleReq("director", "type-1", "Doc A")],
      "sdd",
      [],
      [existingDoc("type-1", false)],
    );
    expect(r.uploaded).toHaveLength(0);
    expect(r.missing).toHaveLength(1);
  });
});

describe("getEffectiveDdLevel", () => {
  it("returns the profile-level when set", () => {
    expect(getEffectiveDdLevel("edd", "sdd")).toBe("edd");
  });

  it("falls back to the account-level when profile-level is null", () => {
    expect(getEffectiveDdLevel(null, "cdd")).toBe("cdd");
  });
});
