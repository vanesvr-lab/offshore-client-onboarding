"use client";

import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { ValidatedLabel, FieldWrapper } from "@/components/shared/ValidatedLabel";
import { useFieldValidation } from "@/hooks/useFieldValidation";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
}: DeclarationsStepProps) {
  const validation = useFieldValidation();
  const isEdd = dueDiligenceLevel === "edd";

  // Resolve via DD requirements first; fall back to name lookup
  const pepTypeId =
    requirements.find((r) => r.requirement_type === "document" && r.document_types?.name === "PEP Declaration Form")?.document_type_id
    ?? documentTypes.find((dt) => dt.name === "PEP Declaration Form")?.id;
  const pepDoc = pepTypeId ? documents.find((d) => d.document_type_id === pepTypeId) : null;

  const isPep = form.is_pep ?? false;
  const hasLegalIssues = form.legal_issues_declared ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Declarations</h2>
        <p className="text-sm text-gray-500">Please complete these compliance declarations honestly and completely. This information is required for regulatory compliance.</p>
      </div>

      {/* PEP Declaration */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium text-brand-navy">Politically Exposed Person (PEP)</Label>
            <p className="text-xs text-gray-500 mt-0.5">Are you, or have you ever been, a politically exposed person or closely associated with one?</p>
          </div>
          <Switch
            checked={isPep}
            onCheckedChange={(checked) => onChange({ is_pep: checked, pep_details: checked ? (form.pep_details ?? "") : "" })}
          />
        </div>

        {isPep && (
          <div className="space-y-1 pt-1">
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
                className="text-sm resize-none"
              />
            </FieldWrapper>
          </div>
        )}

        <div className="rounded-lg border bg-gray-50 p-3 space-y-2">
          <h3 className="text-xs font-medium text-brand-navy">PEP Declaration Form</h3>
          <p className="text-xs text-gray-500">Upload a signed PEP declaration form.</p>
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
      </div>

      {/* Legal Issues Declaration */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium text-brand-navy">Legal Issues or Criminal Record</Label>
            <p className="text-xs text-gray-500 mt-0.5">Have you ever been subject to criminal proceedings, civil litigation, or regulatory sanctions?</p>
          </div>
          <Switch
            checked={hasLegalIssues}
            onCheckedChange={(checked) => onChange({ legal_issues_declared: checked, legal_issues_details: checked ? (form.legal_issues_details ?? "") : "" })}
          />
        </div>

        {hasLegalIssues && (
          <div className="space-y-1 pt-1">
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
                className="text-sm resize-none"
              />
            </FieldWrapper>
          </div>
        )}
      </div>

      {/* Tax Identification Number */}
      <div className="space-y-1">
        <ValidatedLabel state={validation.getFieldState("tax_identification_number", (form.tax_identification_number ?? "") as string)}>
          Tax identification number
        </ValidatedLabel>
        <Input
          value={(form.tax_identification_number ?? "") as string}
          onChange={(e) => onChange({ tax_identification_number: e.target.value })}
          className="text-sm"
          placeholder="TIN / tax ID from your country of tax residence"
        />
      </div>

      {/* EDD: Relationship history + geographic risk */}
      {isEdd && (
        <>
          <div className="border-t pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-brand-navy">Enhanced Due Diligence</h3>

            <div className="space-y-1">
              <ValidatedLabel state={validation.getFieldState("relationship_history", (form.relationship_history ?? "") as string)}>
                Customer relationship history
              </ValidatedLabel>
              <Textarea
                value={(form.relationship_history ?? "") as string}
                onChange={(e) => onChange({ relationship_history: e.target.value })}
                rows={3}
                placeholder="Prior banking relationships, financial institutions, and length of relationships"
                className="text-sm resize-none"
              />
            </div>

            <div className="space-y-1">
              <ValidatedLabel state={validation.getFieldState("geographic_risk_assessment", (form.geographic_risk_assessment ?? "") as string)}>
                Geographic risk information
              </ValidatedLabel>
              <Textarea
                value={(form.geographic_risk_assessment ?? "") as string}
                onChange={(e) => onChange({ geographic_risk_assessment: e.target.value })}
                rows={3}
                placeholder="Countries where you conduct business, hold assets, or have financial connections"
                className="text-sm resize-none"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
