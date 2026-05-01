"use client";

import { CheckCircle2, XCircle, FileText } from "lucide-react";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

interface ReviewStepProps {
  kycRecord: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  dueDiligenceLevel: DueDiligenceLevel;
  requirements: DueDiligenceRequirement[];
  form: Partial<KycRecord>;
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

export function ReviewStep({
  documents,
  documentTypes,
  dueDiligenceLevel,
  requirements,
  form,
}: ReviewStepProps) {
  const isCdd = dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd";
  const isEdd = dueDiligenceLevel === "edd";

  // Build doc status list from DD requirements (avoids hardcoded document names)
  const documentReqs = requirements.filter((r) => r.requirement_type === "document" && r.document_type_id);
  const docStatuses = documentReqs.map((req) => {
    const uploaded = documents.some((d) => d.document_type_id === req.document_type_id && d.is_active !== false);
    return { name: req.label, uploaded };
  });

  // If no requirements available, fall back to level-based static list
  const fallbackDocNames: string[] = [];
  if (docStatuses.length === 0) {
    fallbackDocNames.push("Certified Passport Copy", "Proof of Residential Address");
    if (isCdd) fallbackDocNames.push("Evidence of Source of Funds", "Bank Reference Letter", "PEP Declaration Form");
    if (isEdd) fallbackDocNames.push("Declaration of Source of Wealth", "Tax Residency Certificate");
    fallbackDocNames.forEach((name) => {
      const docType = documentTypes.find((dt) => dt.name === name);
      const uploaded = docType ? documents.some((d) => d.document_type_id === docType.id) : false;
      docStatuses.push({ name, uploaded });
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
        <h3 className="text-sm font-semibold text-brand-navy mb-2">Your Identity</h3>
        <SectionRow label="Full legal name" value={form.full_name as string} />
        <SectionRow label="Aliases / other names" value={form.aliases as string} />
        <SectionRow label="Date of birth" value={form.date_of_birth as string} />
        <SectionRow label="Nationality" value={form.nationality as string} />
        <SectionRow label="Passport country" value={form.passport_country as string} />
        <SectionRow label="Passport number" value={form.passport_number as string} />
        <SectionRow label="Passport expiry" value={form.passport_expiry as string} />
        <SectionRow label="Residential address" value={form.address as string} />
        <SectionRow label="Email" value={form.email as string} />
        <SectionRow label="Phone" value={form.phone as string} />
        <SectionRow label="Occupation" value={form.occupation as string} />
      </div>

      {/* Financial Section */}
      <div className="rounded-lg border bg-white p-4 space-y-1">
        <h3 className="text-sm font-semibold text-brand-navy mb-2">Financial Profile</h3>
        <SectionRow label="Source of funds" value={form.source_of_funds_description as string} />
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
          <h3 className="text-sm font-semibold text-brand-navy mb-2">Declarations</h3>
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
          {docStatuses.map(({ name, uploaded }) => (
            <div key={name} className="flex items-center gap-2">
              {uploaded ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400 shrink-0" />
              )}
              <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className={`text-xs ${uploaded ? "text-gray-700" : "text-red-500"}`}>{name}</span>
              {!uploaded && <span className="text-xs text-red-400 italic ml-auto">Missing</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Missing items warning */}
      {missingDocs.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1">Before submitting, please upload:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {missingDocs.map(({ name }) => (
              <li key={name} className="text-xs text-red-600">{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
