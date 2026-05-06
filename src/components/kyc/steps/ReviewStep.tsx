"use client";

import { CheckCircle2, XCircle, FileText, Pencil } from "lucide-react";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

/** B-050 §5.1 — sub-step kinds the per-person review can jump back to. */
export type ReviewJumpTarget =
  | { kind: "form-identity" }
  | { kind: "form-residential-address" }
  | { kind: "form-financial" }
  | { kind: "form-declarations" }
  | { kind: "doc-list"; category: string };

interface ReviewStepProps {
  kycRecord: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  dueDiligenceLevel: DueDiligenceLevel;
  requirements: DueDiligenceRequirement[];
  form: Partial<KycRecord>;
  /** B-050 §5.1 — when provided, section headers + missing items become clickable
   * jump-to-edit links that navigate to the relevant sub-step. */
  onJumpTo?: (target: ReviewJumpTarget) => void;
}

function SectionRow({ label, value }: { label: string; value: string | null | undefined }) {
  const isEmpty = !value || value === "";
  return (
    <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
      {isEmpty ? (
        <span className="text-xs text-red-500 italic">Not provided</span>
      ) : (
        <span className="text-xs text-gray-800 break-words">{value}</span>
      )}
    </div>
  );
}

function BoolRow({ label, value }: { label: string; value: boolean | null | undefined }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
        <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
        <span className="text-xs text-red-500 italic">Not provided</span>
      </div>
    );
  }
  return (
    <div className="flex gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 w-44 shrink-0">{label}</span>
      <span className="text-xs text-gray-800">{value ? "Yes" : "No"}</span>
    </div>
  );
}

function SectionHeader({
  title,
  onEdit,
}: {
  title: string;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 rounded"
          aria-label={`Edit ${title}`}
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          Edit
        </button>
      )}
    </div>
  );
}

export function ReviewStep({
  documents,
  documentTypes,
  dueDiligenceLevel,
  requirements,
  form,
  onJumpTo,
}: ReviewStepProps) {
  const isCdd = dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd";
  const isEdd = dueDiligenceLevel === "edd";

  // B-067 §4.3 — match the per-person doc-list source of truth exactly:
  // filter by DD level (basic ⊆ sdd ⊆ cdd ⊆ edd), keep only person-scope
  // doc types, and dedupe by document_type_id so the same doc never
  // appears twice when multiple roles require it.
  const DD_LEVEL_INCLUDES: Record<DueDiligenceLevel, ("basic" | "sdd" | "cdd" | "edd")[]> = {
    sdd: ["basic", "sdd"],
    cdd: ["basic", "sdd", "cdd"],
    edd: ["basic", "sdd", "cdd", "edd"],
  };
  const includedLevels = DD_LEVEL_INCLUDES[dueDiligenceLevel] ?? ["basic", "sdd", "cdd"];

  const documentReqsFiltered = requirements.filter(
    (r) =>
      r.requirement_type === "document" &&
      r.document_type_id != null &&
      includedLevels.includes(r.level as "basic" | "sdd" | "cdd" | "edd")
  );

  const seenDocTypeIds = new Set<string>();
  const docStatuses: { name: string; uploaded: boolean; category: string }[] = [];
  for (const req of documentReqsFiltered) {
    const docType = documentTypes.find((dt) => dt.id === req.document_type_id);
    // Skip non-person-scope docs (those live on the outer Documents step).
    if (docType && (docType.scope ?? "person") !== "person") continue;
    if (req.document_type_id && seenDocTypeIds.has(req.document_type_id)) continue;
    if (req.document_type_id) seenDocTypeIds.add(req.document_type_id);
    const uploaded = documents.some(
      (d) => d.document_type_id === req.document_type_id && d.is_active !== false
    );
    docStatuses.push({
      name: docType?.name ?? req.label,
      uploaded,
      category: docType?.category ?? "additional",
    });
  }

  // If no requirements available, fall back to level-based static list
  const fallbackDocNames: string[] = [];
  if (docStatuses.length === 0) {
    fallbackDocNames.push("Certified Passport Copy", "Proof of Residential Address");
    if (isCdd) fallbackDocNames.push("Evidence of Source of Funds", "Bank Reference Letter", "PEP Declaration Form");
    if (isEdd) fallbackDocNames.push("Declaration of Source of Wealth", "Tax Residency Certificate");
    fallbackDocNames.forEach((name) => {
      const docType = documentTypes.find((dt) => dt.name === name);
      const uploaded = docType ? documents.some((d) => d.document_type_id === docType.id) : false;
      docStatuses.push({ name, uploaded, category: docType?.category ?? "additional" });
    });
  }

  const missingDocs = docStatuses.filter((d) => !d.uploaded);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Review & Submit</h2>
        <p className="text-sm text-gray-600">Review your information below. Once submitted, our compliance team will review your profile.</p>
      </div>

      {/* Identity Section */}
      <div className="rounded-lg border bg-white p-4 space-y-1">
        <SectionHeader
          title="Your Identity"
          onEdit={onJumpTo ? () => onJumpTo({ kind: "form-identity" }) : undefined}
        />
        <SectionRow label="Full legal name" value={form.full_name as string} />
        <SectionRow label="Aliases / other names" value={form.aliases as string} />
        <SectionRow label="Date of birth" value={form.date_of_birth as string} />
        <SectionRow label="Nationality" value={form.nationality as string} />
        <SectionRow label="Passport country" value={form.passport_country as string} />
        <SectionRow label="Passport number" value={form.passport_number as string} />
        <SectionRow label="Passport expiry" value={form.passport_expiry as string} />
        <SectionRow label="Email" value={form.email as string} />
        <SectionRow label="Phone" value={form.phone as string} />
        <SectionRow label="Occupation" value={form.occupation as string} />
      </div>

      {/* B-049 §2 — Residential Address (separate sub-step). Falls back to the
          legacy `address` text if the structured fields haven't been filled. */}
      <div className="rounded-lg border bg-white p-4 space-y-1">
        <SectionHeader
          title="Residential Address"
          onEdit={onJumpTo ? () => onJumpTo({ kind: "form-residential-address" }) : undefined}
        />
        {form.address_line_1 || form.address_city || form.address_country ? (
          <>
            <SectionRow label="Address line 1" value={form.address_line_1 as string} />
            <SectionRow label="Address line 2" value={form.address_line_2 as string} />
            <SectionRow label="City" value={form.address_city as string} />
            <SectionRow label="State / Region" value={form.address_state as string} />
            <SectionRow label="Postal code" value={form.address_postal_code as string} />
            <SectionRow label="Country" value={form.address_country as string} />
          </>
        ) : (
          <SectionRow label="Residential address" value={form.address as string} />
        )}
      </div>

      {/* Financial / Professional Section */}
      <div className="rounded-lg border bg-white p-4 space-y-1">
        <SectionHeader
          title="Professional & Financial"
          onEdit={onJumpTo ? () => onJumpTo({ kind: "form-financial" }) : undefined}
        />
        <SectionRow label="Current employer" value={form.employer as string} />
        <SectionRow
          label="Years in current role"
          value={form.years_in_role == null ? null : String(form.years_in_role)}
        />
        <SectionRow
          label="Total years of experience"
          value={form.years_total_experience == null ? null : String(form.years_total_experience)}
        />
        <SectionRow label="Industry" value={form.industry as string} />
        <SectionRow
          label="Source of funds"
          value={
            (form.source_of_funds_type as string | null)
              ? form.source_of_funds_type === "other"
                ? `Other — ${(form.source_of_funds_other as string) ?? ""}`
                : (form.source_of_funds_type as string)
              : (form.source_of_funds_description as string)
          }
        />
        {isCdd && (
          <>
            <SectionRow label="Work address" value={form.work_address as string} />
            <SectionRow label="Work phone" value={form.work_phone as string} />
            <SectionRow label="Work email" value={form.work_email as string} />
          </>
        )}
        {isEdd && (
          <SectionRow label="Source of wealth" value={form.source_of_wealth_description as string} />
        )}
      </div>

      {/* Declarations Section (CDD/EDD only) */}
      {isCdd && (
        <div className="rounded-lg border bg-white p-4 space-y-1">
          <SectionHeader
            title="Declarations"
            onEdit={onJumpTo ? () => onJumpTo({ kind: "form-declarations" }) : undefined}
          />
          <BoolRow label="Politically exposed person" value={form.is_pep as boolean | null} />
          {form.is_pep && (
            <SectionRow label="PEP details" value={form.pep_details as string} />
          )}
          <BoolRow label="Legal issues declared" value={form.legal_issues_declared as boolean | null} />
          {form.legal_issues_declared && (
            <SectionRow label="Legal issues details" value={form.legal_issues_details as string} />
          )}
          <SectionRow label="Tax identification number" value={form.tax_identification_number as string} />
          {isEdd && (
            <>
              <SectionRow label="Relationship history" value={form.relationship_history as string} />
              <SectionRow label="Geographic risk info" value={form.geographic_risk_assessment as string} />
            </>
          )}
        </div>
      )}

      {/* Documents Section */}
      <div className="rounded-lg border bg-white p-4">
        <h3 className="text-sm font-semibold text-brand-navy mb-3">Documents</h3>
        <div className="space-y-2">
          {docStatuses.map(({ name, uploaded, category }) => {
            const canJump = !uploaded && !!onJumpTo;
            const Tag: keyof JSX.IntrinsicElements = canJump ? "button" : "div";
            const baseClasses = "flex items-center gap-2 w-full text-left";
            const interactiveClasses = canJump
              ? " hover:bg-red-50 rounded px-1 -mx-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-red-500"
              : "";
            return (
              <Tag
                key={name}
                {...(canJump
                  ? {
                      type: "button" as const,
                      onClick: () => onJumpTo?.({ kind: "doc-list", category }),
                      "aria-label": `Edit — upload ${name}`,
                    }
                  : {})}
                className={baseClasses + interactiveClasses}
              >
                {uploaded ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                )}
                <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className={`text-xs ${uploaded ? "text-gray-700" : "text-red-500"}`}>{name}</span>
                {!uploaded && <span className="text-xs text-red-400 italic ml-auto">Missing</span>}
              </Tag>
            );
          })}
        </div>
      </div>

      {/* Missing items warning */}
      {missingDocs.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1">Before submitting, please upload:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {missingDocs.map(({ name, category }) => {
              const canJump = !!onJumpTo;
              return (
                <li key={name} className="text-xs text-red-600">
                  {canJump ? (
                    <button
                      type="button"
                      onClick={() => onJumpTo?.({ kind: "doc-list", category })}
                      className="underline hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-red-500 rounded"
                    >
                      {name}
                    </button>
                  ) : (
                    name
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
