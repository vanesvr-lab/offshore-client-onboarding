"use client";

import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { ValidatedLabel, FieldWrapper } from "@/components/shared/ValidatedLabel";
import { useFieldValidation } from "@/hooks/useFieldValidation";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { formWidths } from "@/lib/form-widths";
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
  /** When true, hide all in-step document upload cards (handled in a side panel). Default: false */
  hideDocumentUploads?: boolean;
  /** B-037 — when true, empty required fields render as red on first paint (no need for focus). */
  showErrorsImmediately?: boolean;
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
        documentDetailMode={!!existing}
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
  hideDocumentUploads = false,
  showErrorsImmediately = false,
}: FinancialStepProps) {
  const validation = useFieldValidation({ showErrorsImmediately });
  const isCdd = dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd";
  const isEdd = dueDiligenceLevel === "edd";

  const showSourceOfFunds = hasRequirement(requirements, "source_of_funds_description") || isCdd || isEdd;
  const showWorkDetails = isCdd || isEdd;
  const showSourceOfWealth = isEdd || hasRequirement(requirements, "source_of_wealth_description");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Financial Profile</h2>
        <p className="text-sm text-gray-600">
          Help us understand the source of your funds and financial background.
          This is required for regulatory compliance.
        </p>
      </div>

      {/* B-049 §3.1 — Manual Professional Details (no CV prefill).
          Required: occupation, employer, years_in_role, years_total_experience, industry.
          Optional: work address / phone / email (CDD+/EDD only). */}
      <section>
        <h3 className="text-sm font-semibold text-brand-navy mb-3">Professional Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <ValidatedLabel
              state={validation.getFieldState("occupation", (form.occupation ?? "") as string, true)}
              required
            >Current occupation / job title</ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("occupation", (form.occupation ?? "") as string, true)}>
              <Input
                value={(form.occupation ?? "") as string}
                onChange={(e) => onChange({ occupation: e.target.value })}
                onBlur={() => validation.markTouched("occupation")}
                placeholder="e.g. Head of Compliance"
                aria-required="true"
                autoComplete="organization-title"
                className={`text-sm ${formWidths.fullName}`}
              />
            </FieldWrapper>
          </div>
          <div className="space-y-1">
            <ValidatedLabel
              state={validation.getFieldState("employer", (form.employer ?? "") as string, true)}
              required
            >Current employer</ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("employer", (form.employer ?? "") as string, true)}>
              <Input
                value={(form.employer ?? "") as string}
                onChange={(e) => onChange({ employer: e.target.value })}
                onBlur={() => validation.markTouched("employer")}
                placeholder="e.g. Stark Industries Holdings"
                aria-required="true"
                autoComplete="organization"
                className={`text-sm ${formWidths.fullName}`}
              />
            </FieldWrapper>
          </div>
          <div className="space-y-1">
            <ValidatedLabel
              state={validation.getFieldState("years_in_role", String(form.years_in_role ?? ""), true)}
              required
            >Years in current role</ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("years_in_role", String(form.years_in_role ?? ""), true)}>
              <Input
                type="number"
                min="0"
                max="80"
                step="1"
                inputMode="numeric"
                value={form.years_in_role == null ? "" : String(form.years_in_role)}
                onChange={(e) =>
                  onChange({
                    years_in_role: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                onBlur={() => validation.markTouched("years_in_role")}
                aria-required="true"
                placeholder="e.g. 7"
                className="text-sm md:w-32"
              />
            </FieldWrapper>
          </div>
          <div className="space-y-1">
            <ValidatedLabel
              state={validation.getFieldState(
                "years_total_experience",
                String(form.years_total_experience ?? ""),
                true
              )}
              required
            >Total years of professional experience</ValidatedLabel>
            <FieldWrapper
              state={validation.getFieldState(
                "years_total_experience",
                String(form.years_total_experience ?? ""),
                true
              )}
            >
              <Input
                type="number"
                min="0"
                max="80"
                step="1"
                inputMode="numeric"
                value={form.years_total_experience == null ? "" : String(form.years_total_experience)}
                onChange={(e) =>
                  onChange({
                    years_total_experience: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                onBlur={() => validation.markTouched("years_total_experience")}
                aria-required="true"
                placeholder="e.g. 15"
                className="text-sm md:w-32"
              />
            </FieldWrapper>
          </div>
          <div className="space-y-1">
            <ValidatedLabel
              state={validation.getFieldState("industry", (form.industry ?? "") as string, true)}
              required
            >Industry</ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("industry", (form.industry ?? "") as string, true)}>
              <select
                value={(form.industry ?? "") as string}
                onChange={(e) => onChange({ industry: e.target.value || null })}
                onBlur={() => validation.markTouched("industry")}
                aria-required="true"
                className={`w-full border rounded-md px-3 py-2 text-sm bg-white ${formWidths.country}`}
              >
                <option value="">Select industry…</option>
                <option>Banking & Financial Services</option>
                <option>Investment Management</option>
                <option>Legal Services</option>
                <option>Accounting & Audit</option>
                <option>Real Estate</option>
                <option>Technology</option>
                <option>Manufacturing</option>
                <option>Energy & Resources</option>
                <option>Retail & Consumer</option>
                <option>Healthcare</option>
                <option>Government / Public Sector</option>
                <option>Non-profit</option>
                <option>Other</option>
              </select>
            </FieldWrapper>
          </div>
          {showWorkDetails && (
            <>
              <div className="md:col-span-2 space-y-1">
                <ValidatedLabel state={validation.getFieldState("work_address", (form.work_address ?? "") as string)}>Work address</ValidatedLabel>
                <FieldWrapper state={validation.getFieldState("work_address", (form.work_address ?? "") as string)}>
                  <Textarea
                    value={(form.work_address ?? "") as string}
                    onChange={(e) => onChange({ work_address: e.target.value })}
                    onBlur={() => validation.markTouched("work_address")}
                    rows={2}
                    autoComplete="street-address"
                    placeholder="Business / employer address"
                    className="text-sm resize-none max-w-2xl"
                  />
                </FieldWrapper>
              </div>
              <div className="space-y-1">
                <ValidatedLabel state={validation.getFieldState("work_phone", (form.work_phone ?? "") as string)}>Work phone</ValidatedLabel>
                <Input
                  value={(form.work_phone ?? "") as string}
                  onChange={(e) => onChange({ work_phone: e.target.value })}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+230 555 0000"
                  className={`text-sm ${formWidths.phone}`}
                />
              </div>
              <div className="space-y-1">
                <ValidatedLabel state={validation.getFieldState("work_email", (form.work_email ?? "") as string)}>Work email</ValidatedLabel>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={(form.work_email ?? "") as string}
                  onChange={(e) => onChange({ work_email: e.target.value })}
                  placeholder="name@company.com"
                  className={`text-sm ${formWidths.email}`}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {showSourceOfFunds && (
        <>
          {/* B-049 §3.1 — Source of funds is a required dropdown; the legacy
              free-text description stays as supporting detail. */}
          <div className="space-y-3 max-w-2xl">
            <div className="space-y-1">
              <ValidatedLabel
                state={validation.getFieldState(
                  "source_of_funds_type",
                  (form.source_of_funds_type ?? "") as string,
                  true
                )}
                required
              >
                Source of funds
              </ValidatedLabel>
              <FieldWrapper
                state={validation.getFieldState(
                  "source_of_funds_type",
                  (form.source_of_funds_type ?? "") as string,
                  true
                )}
              >
                <select
                  value={(form.source_of_funds_type ?? "") as string}
                  onChange={(e) => onChange({ source_of_funds_type: e.target.value || null })}
                  onBlur={() => validation.markTouched("source_of_funds_type")}
                  aria-required="true"
                  className={`w-full border rounded-md px-3 py-2 text-sm bg-white ${formWidths.country}`}
                >
                  <option value="">Select…</option>
                  <option value="salary">Salary</option>
                  <option value="investments">Investments</option>
                  <option value="inheritance">Inheritance</option>
                  <option value="business_sale">Business sale</option>
                  <option value="other">Other</option>
                </select>
              </FieldWrapper>
            </div>

            {form.source_of_funds_type === "other" && (
              <div className="space-y-1">
                <ValidatedLabel
                  state={validation.getFieldState(
                    "source_of_funds_other",
                    (form.source_of_funds_other ?? "") as string,
                    true
                  )}
                  required
                >
                  Please specify
                </ValidatedLabel>
                <FieldWrapper
                  state={validation.getFieldState(
                    "source_of_funds_other",
                    (form.source_of_funds_other ?? "") as string,
                    true
                  )}
                >
                  <Input
                    value={(form.source_of_funds_other ?? "") as string}
                    onChange={(e) => onChange({ source_of_funds_other: e.target.value })}
                    onBlur={() => validation.markTouched("source_of_funds_other")}
                    aria-required="true"
                    placeholder="Describe your source of funds"
                    className="text-sm"
                  />
                </FieldWrapper>
              </div>
            )}

            <div className="space-y-1">
              <ValidatedLabel
                state={validation.getFieldState("source_of_funds_description", (form.source_of_funds_description ?? "") as string)}
              >
                Additional context <span className="text-gray-400 font-normal">(optional)</span>
              </ValidatedLabel>
              <FieldWrapper state={validation.getFieldState("source_of_funds_description", (form.source_of_funds_description ?? "") as string)}>
                <Textarea
                  value={(form.source_of_funds_description ?? "") as string}
                  onChange={(e) => onChange({ source_of_funds_description: e.target.value })}
                  onBlur={() => validation.markTouched("source_of_funds_description")}
                  rows={3}
                  placeholder="Anything else regulators should know — employer / business / asset names, jurisdictions, etc."
                  className={`text-sm resize-none ${formWidths.longFormTextareaMin}`}
                />
              </FieldWrapper>
            </div>
          </div>

          {!hideDocumentUploads && (
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
          )}

          {!hideDocumentUploads && isCdd && (
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
          {!hideDocumentUploads && (
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
          )}

          {!hideDocumentUploads && (
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
          )}
        </>
      )}

      {showSourceOfWealth && (
        <>
          <div className="border-t pt-6">
            <h3 className="text-sm font-semibold text-brand-navy mb-3">Source of Wealth</h3>
            <div className="space-y-1 max-w-2xl">
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
                  className={`text-sm resize-none ${formWidths.longFormTextareaMin}`}
                />
              </FieldWrapper>
            </div>
          </div>

          {!hideDocumentUploads && (
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
          )}

          {!hideDocumentUploads && (
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
          )}

          {!hideDocumentUploads && (
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
          )}

          {!hideDocumentUploads && (
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
          )}
        </>
      )}
    </div>
  );
}
