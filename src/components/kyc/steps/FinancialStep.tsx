"use client";

import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { ValidatedLabel, FieldWrapper } from "@/components/shared/ValidatedLabel";
import { useFieldValidation } from "@/hooks/useFieldValidation";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

interface FinancialStepProps {
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

function InlineUpload({
  label,
  description,
  clientId,
  kycRecordId,
  documentTypes,
  documents,
  documentTypeName,
  onUploadComplete,
}: {
  label: string;
  description: string;
  clientId: string;
  kycRecordId: string;
  documentTypes: DocumentType[];
  documents: DocumentRecord[];
  documentTypeName: string;
  onUploadComplete: (doc: DocumentRecord) => void;
}) {
  const docType = documentTypes.find((dt) => dt.name === documentTypeName);
  const existing = docType ? documents.find((d) => d.document_type_id === docType.id) : null;
  return (
    <div className="rounded-lg border bg-gray-50 p-4 space-y-2">
      <h3 className="text-sm font-medium text-brand-navy">{label}</h3>
      <p className="text-xs text-gray-500">{description}</p>
      <DocumentUploadWidget
        clientId={clientId}
        kycRecordId={kycRecordId}
        documentTypeId={docType?.id}
        documentTypeName={documentTypeName}
        existingDocument={existing ?? null}
        onUploadComplete={onUploadComplete}
        compact
      />
    </div>
  );
}

function hasRequirement(requirements: DueDiligenceRequirement[], key: string): boolean {
  return requirements.some((r) => r.requirement_key === key);
}

export function FinancialStep({
  clientId,
  kycRecord,
  documents,
  documentTypes,
  dueDiligenceLevel,
  requirements,
  form,
  onChange,
  onDocumentUploaded,
}: FinancialStepProps) {
  const validation = useFieldValidation();
  const isCdd = dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd";
  const isEdd = dueDiligenceLevel === "edd";

  const showSourceOfFunds = hasRequirement(requirements, "source_of_funds_description") || isCdd || isEdd;
  const showWorkDetails = isCdd || isEdd;
  const showSourceOfWealth = isEdd || hasRequirement(requirements, "source_of_wealth_description");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Financial Profile</h2>
        <p className="text-sm text-gray-500">Help us understand the source of your funds and financial background. This is required for regulatory compliance.</p>
      </div>

      {showSourceOfFunds && (
        <>
          <div className="space-y-1">
            <ValidatedLabel
              state={validation.getFieldState("source_of_funds_description", (form.source_of_funds_description ?? "") as string, true)}
              required
            >
              Source of funds
            </ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("source_of_funds_description", (form.source_of_funds_description ?? "") as string, true)}>
              <Textarea
                value={(form.source_of_funds_description ?? "") as string}
                onChange={(e) => onChange({ source_of_funds_description: e.target.value })}
                onBlur={() => validation.markTouched("source_of_funds_description")}
                rows={3}
                placeholder={isCdd ? "Describe in detail where your funds come from — salary, business income, investments, inheritance, etc." : "Brief description of where your funds come from"}
                className="text-sm resize-none"
              />
            </FieldWrapper>
          </div>

          <InlineUpload
            label="Declaration of Source of Funds"
            description="Upload a signed declaration describing the origin of your funds."
            clientId={clientId}
            kycRecordId={kycRecord.id}
            documentTypes={documentTypes}
            documents={documents}
            documentTypeName="Declaration of Source of Funds"
            onUploadComplete={onDocumentUploaded}
          />

          {isCdd && (
            <InlineUpload
              label="Evidence of Source of Funds"
              description="Supporting documents: bank statements, payslips, audited accounts, etc."
              clientId={clientId}
              kycRecordId={kycRecord.id}
              documentTypes={documentTypes}
              documents={documents}
              documentTypeName="Evidence of Source of Funds"
              onUploadComplete={onDocumentUploaded}
            />
          )}
        </>
      )}

      {showWorkDetails && (
        <>
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-brand-navy mb-3">Work / Professional Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1">
                <ValidatedLabel state={validation.getFieldState("work_address", (form.work_address ?? "") as string)} >Work address</ValidatedLabel>
                <FieldWrapper state={validation.getFieldState("work_address", (form.work_address ?? "") as string)}>
                  <Textarea
                    value={(form.work_address ?? "") as string}
                    onChange={(e) => onChange({ work_address: e.target.value })}
                    onBlur={() => validation.markTouched("work_address")}
                    rows={2}
                    placeholder="Business / employer address"
                    className="text-sm resize-none"
                  />
                </FieldWrapper>
              </div>
              <div className="space-y-1">
                <ValidatedLabel state={validation.getFieldState("work_phone", (form.work_phone ?? "") as string)}>Work phone</ValidatedLabel>
                <Input
                  value={(form.work_phone ?? "") as string}
                  onChange={(e) => onChange({ work_phone: e.target.value })}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <ValidatedLabel state={validation.getFieldState("work_email", (form.work_email ?? "") as string)}>Work email</ValidatedLabel>
                <Input
                  type="email"
                  value={(form.work_email ?? "") as string}
                  onChange={(e) => onChange({ work_email: e.target.value })}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <InlineUpload
            label="Bank Reference Letter"
            description="A letter from your bank confirming you are a customer in good standing, dated within the last 3 months."
            clientId={clientId}
            kycRecordId={kycRecord.id}
            documentTypes={documentTypes}
            documents={documents}
            documentTypeName="Bank Reference Letter"
            onUploadComplete={onDocumentUploaded}
          />

          <InlineUpload
            label="Curriculum Vitae / Resume"
            description="Your CV showing professional background, qualifications, and employment history."
            clientId={clientId}
            kycRecordId={kycRecord.id}
            documentTypes={documentTypes}
            documents={documents}
            documentTypeName="Curriculum Vitae / Resume"
            onUploadComplete={onDocumentUploaded}
          />
        </>
      )}

      {showSourceOfWealth && (
        <>
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-brand-navy mb-3">Source of Wealth</h3>
            <div className="space-y-1">
              <ValidatedLabel state={validation.getFieldState("source_of_wealth_description", (form.source_of_wealth_description ?? "") as string, true)} required>
                Source of wealth description
              </ValidatedLabel>
              <FieldWrapper state={validation.getFieldState("source_of_wealth_description", (form.source_of_wealth_description ?? "") as string, true)}>
                <Textarea
                  value={(form.source_of_wealth_description ?? "") as string}
                  onChange={(e) => onChange({ source_of_wealth_description: e.target.value })}
                  onBlur={() => validation.markTouched("source_of_wealth_description")}
                  rows={3}
                  placeholder="Explain how you accumulated your overall wealth — business sale, inheritance, investment returns, etc."
                  className="text-sm resize-none"
                />
              </FieldWrapper>
            </div>
          </div>

          <InlineUpload
            label="Declaration of Source of Wealth"
            description="Signed declaration explaining how you accumulated your wealth."
            clientId={clientId}
            kycRecordId={kycRecord.id}
            documentTypes={documentTypes}
            documents={documents}
            documentTypeName="Declaration of Source of Wealth"
            onUploadComplete={onDocumentUploaded}
          />

          <InlineUpload
            label="Evidence of Source of Wealth"
            description="Supporting documents: share sale agreements, business accounts, inheritance documents, etc."
            clientId={clientId}
            kycRecordId={kycRecord.id}
            documentTypes={documentTypes}
            documents={documents}
            documentTypeName="Evidence of Source of Wealth"
            onUploadComplete={onDocumentUploaded}
          />

          <InlineUpload
            label="Professional Reference Letter"
            description="A reference from a professional who can vouch for your financial standing."
            clientId={clientId}
            kycRecordId={kycRecord.id}
            documentTypes={documentTypes}
            documents={documents}
            documentTypeName="Professional Reference Letter"
            onUploadComplete={onDocumentUploaded}
          />

          <div className="space-y-1">
            <ValidatedLabel state={validation.getFieldState("tax_identification_number", (form.tax_identification_number ?? "") as string)}>Tax identification number</ValidatedLabel>
            <Input
              value={(form.tax_identification_number ?? "") as string}
              onChange={(e) => onChange({ tax_identification_number: e.target.value })}
              className="text-sm"
              placeholder="TIN / tax ID from your country of tax residence"
            />
          </div>

          <InlineUpload
            label="Tax Residency Certificate"
            description="Certificate of tax residency from your country."
            clientId={clientId}
            kycRecordId={kycRecord.id}
            documentTypes={documentTypes}
            documents={documents}
            documentTypeName="Tax Residency Certificate"
            onUploadComplete={onDocumentUploaded}
          />
        </>
      )}
    </div>
  );
}
