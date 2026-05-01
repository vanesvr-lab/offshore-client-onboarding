"use client";

import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { ValidatedLabel, FieldWrapper } from "@/components/shared/ValidatedLabel";
import { YesNoToggle } from "@/components/shared/YesNoToggle";
import { useFieldValidation } from "@/hooks/useFieldValidation";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formWidths } from "@/lib/form-widths";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

interface DeclarationsStepProps {
  clientId: string;
  kycRecord: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  dueDiligenceLevel: DueDiligenceLevel;
  requirements: DueDiligenceRequirement[];
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
  onDocumentUploaded: (doc: DocumentRecord) => void;
  /** When true, hide the in-step PEP Declaration upload card (handled in a side panel). Default: false */
  hideDocumentUploads?: boolean;
  /** B-037 — when true, empty required fields render as red on first paint (no need for focus). */
  showErrorsImmediately?: boolean;
}

export function DeclarationsStep({
  clientId,
  kycRecord,
  documents,
  documentTypes,
  dueDiligenceLevel,
  requirements,
  form,
  onChange,
  onDocumentUploaded,
  hideDocumentUploads = false,
  showErrorsImmediately = false,
}: DeclarationsStepProps) {
  const validation = useFieldValidation({ showErrorsImmediately });
  const isEdd = dueDiligenceLevel === "edd";

  // Resolve via DD requirements first; fall back to name lookup
  const pepTypeId =
    requirements.find((r) => r.requirement_type === "document" && r.document_types?.name === "PEP Declaration Form")?.document_type_id
    ?? documentTypes.find((dt) => dt.name === "PEP Declaration Form")?.id;
  const pepDoc = pepTypeId ? documents.find((d) => d.document_type_id === pepTypeId) : null;

  const isPep = form.is_pep ?? false;
  const hasLegalIssues = form.legal_issues_declared ?? false;
  const pepValue = (form.is_pep ?? null) as boolean | null;
  const legalValue = (form.legal_issues_declared ?? null) as boolean | null;

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Declarations</h2>
        <p className="text-sm text-gray-600">
          Please complete these compliance declarations honestly and completely.
          This information is required for regulatory compliance.
        </p>
      </div>

      {/* PEP Declaration — vertically stacked, no card-on-card */}
      <div className="space-y-3">
        <div>
          <label className="block text-base font-semibold text-gray-900">
            Politically Exposed Person (PEP) <span className="text-red-600" aria-hidden="true">*</span>
          </label>
          <p className="text-sm text-gray-600 mt-1">
            Are you, or have you ever been, a politically exposed person or
            closely associated with one?
          </p>
        </div>
        <YesNoToggle
          ariaLabel="Politically Exposed Person status"
          value={pepValue}
          onChange={(v) =>
            onChange({
              is_pep: v,
              pep_details: v ? (form.pep_details ?? "") : "",
            })
          }
        />

        {isPep && (
          <div className="pt-2 max-w-2xl">
            <ValidatedLabel
              state={validation.getFieldState("pep_details", (form.pep_details ?? "") as string, true)}
              required
            >
              PEP details
            </ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("pep_details", (form.pep_details ?? "") as string, true)}>
              <Textarea
                value={(form.pep_details ?? "") as string}
                onChange={(e) => onChange({ pep_details: e.target.value })}
                onBlur={() => validation.markTouched("pep_details")}
                rows={3}
                placeholder="Describe your PEP status — role, country, period, and nature of exposure"
                className={`text-sm resize-none ${formWidths.longFormTextareaMin}`}
              />
            </FieldWrapper>
          </div>
        )}

        {!hideDocumentUploads && (
          <div className="rounded-lg border bg-gray-50 p-3 space-y-2 mt-3">
            <h3 className="text-xs font-medium text-brand-navy">PEP Declaration Form</h3>
            <p className="text-xs text-gray-600">Upload a signed PEP declaration form.</p>
            <DocumentUploadWidget
              clientId={clientId}
              kycRecordId={kycRecord.id}
              documentTypeId={pepTypeId}
              documentTypeName="PEP Declaration Form"
              existingDocument={pepDoc ?? null}
              onUploadComplete={onDocumentUploaded}
              compact
              documentDetailMode={!!pepDoc}
            />
          </div>
        )}
      </div>

      {/* Legal Issues Declaration */}
      <div className="space-y-3">
        <div>
          <label className="block text-base font-semibold text-gray-900">
            Legal Issues or Criminal Record <span className="text-red-600" aria-hidden="true">*</span>
          </label>
          <p className="text-sm text-gray-600 mt-1">
            Have you ever been subject to criminal proceedings, civil litigation,
            or regulatory sanctions?
          </p>
        </div>
        <YesNoToggle
          ariaLabel="Legal issues or criminal record"
          value={legalValue}
          onChange={(v) =>
            onChange({
              legal_issues_declared: v,
              legal_issues_details: v ? (form.legal_issues_details ?? "") : "",
            })
          }
        />

        {hasLegalIssues && (
          <div className="pt-2 max-w-2xl">
            <ValidatedLabel
              state={validation.getFieldState("legal_issues_details", (form.legal_issues_details ?? "") as string, true)}
              required
            >
              Legal issues details
            </ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("legal_issues_details", (form.legal_issues_details ?? "") as string, true)}>
              <Textarea
                value={(form.legal_issues_details ?? "") as string}
                onChange={(e) => onChange({ legal_issues_details: e.target.value })}
                onBlur={() => validation.markTouched("legal_issues_details")}
                rows={3}
                placeholder="Describe the nature of the legal issue, jurisdiction, outcome, and current status"
                className={`text-sm resize-none ${formWidths.longFormTextareaMin}`}
              />
            </FieldWrapper>
          </div>
        )}
      </div>

      {/* Tax Identification Number — width system: identifier (w-56) */}
      <div className="space-y-1">
        <ValidatedLabel state={validation.getFieldState("tax_identification_number", (form.tax_identification_number ?? "") as string)}>
          Tax identification number
        </ValidatedLabel>
        <Input
          value={(form.tax_identification_number ?? "") as string}
          onChange={(e) => onChange({ tax_identification_number: e.target.value })}
          className={`text-sm ${formWidths.identifier}`}
          placeholder="e.g. NI number, SSN, TIN"
          autoComplete="off"
          inputMode="text"
        />
        <p className="mt-1 text-xs text-gray-600">
          Your jurisdiction&apos;s tax identifier (e.g. NI number, SSN, TIN).
        </p>
      </div>

      {/* EDD: Relationship history + geographic risk */}
      {isEdd && (
        <div className="border-t pt-6 space-y-6">
          <h3 className="text-sm font-semibold text-brand-navy">Enhanced Due Diligence</h3>

          <div className="space-y-1 max-w-2xl">
            <ValidatedLabel state={validation.getFieldState("relationship_history", (form.relationship_history ?? "") as string)}>
              Customer relationship history
            </ValidatedLabel>
            <Textarea
              value={(form.relationship_history ?? "") as string}
              onChange={(e) => onChange({ relationship_history: e.target.value })}
              rows={3}
              placeholder="Prior banking relationships, financial institutions, and length of relationships"
              className={`text-sm resize-none ${formWidths.longFormTextareaMin}`}
            />
          </div>

          <div className="space-y-1 max-w-2xl">
            <ValidatedLabel state={validation.getFieldState("geographic_risk_assessment", (form.geographic_risk_assessment ?? "") as string)}>
              Geographic risk information
            </ValidatedLabel>
            <Textarea
              value={(form.geographic_risk_assessment ?? "") as string}
              onChange={(e) => onChange({ geographic_risk_assessment: e.target.value })}
              rows={3}
              placeholder="Countries where you conduct business, hold assets, or have financial connections"
              className={`text-sm resize-none ${formWidths.longFormTextareaMin}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
