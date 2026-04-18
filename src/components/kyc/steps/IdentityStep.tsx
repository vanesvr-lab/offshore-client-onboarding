"use client";

import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { ValidatedLabel, FieldWrapper } from "@/components/shared/ValidatedLabel";
import { useFieldValidation } from "@/hooks/useFieldValidation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceRequirement } from "@/types";

interface IdentityStepProps {
  clientId: string;
  kycRecord: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
  onDocumentUploaded: (doc: DocumentRecord) => void;
}

function Field({
  label,
  fieldKey,
  form,
  onChange,
  type = "text",
  placeholder,
  required,
  validation,
}: {
  label: string;
  fieldKey: keyof KycRecord;
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  validation: ReturnType<typeof useFieldValidation>;
}) {
  const value = (form[fieldKey] ?? "") as string;
  const state = validation.getFieldState(fieldKey as string, value, required);

  return (
    <div className="space-y-1">
      <ValidatedLabel state={state} required={required}>{label}</ValidatedLabel>
      <FieldWrapper state={state}>
        <Input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange({ [fieldKey]: e.target.value } as Partial<KycRecord>)}
          onBlur={() => validation.markTouched(fieldKey as string)}
          className="text-sm"
        />
      </FieldWrapper>
    </div>
  );
}

export function IdentityStep({
  clientId,
  kycRecord,
  documents,
  documentTypes,
  requirements,
  form,
  onChange,
  onDocumentUploaded,
}: IdentityStepProps) {
  const validation = useFieldValidation();

  // Resolve doc type IDs from DD requirements first; fall back to name lookup
  function resolveDocTypeId(label: string): string | undefined {
    return (
      requirements.find((r) => r.requirement_type === "document" && r.document_types?.name === label)?.document_type_id
      ?? documentTypes.find((dt) => dt.name === label)?.id
    );
  }
  const passportTypeId = resolveDocTypeId("Certified Passport Copy");
  const addressTypeId = resolveDocTypeId("Proof of Residential Address");
  const passportDoc = passportTypeId ? documents.find((d) => d.document_type_id === passportTypeId) : null;
  const addressDoc = addressTypeId ? documents.find((d) => d.document_type_id === addressTypeId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Your Identity</h2>
        <p className="text-sm text-gray-500">Please provide your identity information and upload your passport and proof of address.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Full legal name" fieldKey="full_name" form={form} onChange={onChange} required validation={validation} placeholder="As it appears on your passport" />
        <Field label="Aliases / other names" fieldKey="aliases" form={form} onChange={onChange} validation={validation} placeholder="Maiden name, nicknames, etc." />
        <Field label="Date of birth" fieldKey="date_of_birth" form={form} onChange={onChange} type="date" required validation={validation} />
        <Field label="Nationality" fieldKey="nationality" form={form} onChange={onChange} required validation={validation} placeholder="e.g. British" />
        <Field label="Passport country" fieldKey="passport_country" form={form} onChange={onChange} required validation={validation} placeholder="Country that issued your passport" />
        <Field label="Passport number" fieldKey="passport_number" form={form} onChange={onChange} required validation={validation} />
        <Field label="Passport expiry date" fieldKey="passport_expiry" form={form} onChange={onChange} type="date" required validation={validation} />
      </div>

      {/* Passport upload */}
      <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-brand-navy">Certified Passport Copy</h3>
        <p className="text-xs text-gray-500">Upload a clear copy of your passport photo page. Must be certified by a solicitor, notary, or bank official.</p>
        <DocumentUploadWidget
          clientId={clientId}
          kycRecordId={kycRecord.id}
          documentTypeId={passportTypeId}
          documentTypeName="Certified Passport Copy"
          existingDocument={passportDoc ?? null}
          onUploadComplete={onDocumentUploaded}
          compact
          documentDetailMode={!!passportDoc}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <div className="space-y-1">
            <ValidatedLabel state={validation.getFieldState("address", (form.address ?? "") as string, true)} required>Residential address</ValidatedLabel>
            <FieldWrapper state={validation.getFieldState("address", (form.address ?? "") as string, true)}>
              <Textarea
                value={(form.address ?? "") as string}
                onChange={(e) => onChange({ address: e.target.value })}
                onBlur={() => validation.markTouched("address")}
                rows={2}
                placeholder="Full residential address including country"
                className="text-sm resize-none"
              />
            </FieldWrapper>
          </div>
        </div>
      </div>

      {/* Proof of address upload */}
      <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-brand-navy">Proof of Residential Address</h3>
        <p className="text-xs text-gray-500">Upload a utility bill, bank statement, or government correspondence dated within the last 3 months.</p>
        <DocumentUploadWidget
          clientId={clientId}
          kycRecordId={kycRecord.id}
          documentTypeId={addressTypeId}
          documentTypeName="Proof of Residential Address"
          existingDocument={addressDoc ?? null}
          onUploadComplete={onDocumentUploaded}
          compact
          documentDetailMode={!!addressDoc}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Email address" fieldKey="email" form={form} onChange={onChange} type="email" required validation={validation} />
        <Field label="Phone number" fieldKey="phone" form={form} onChange={onChange} type="tel" validation={validation} />
      </div>

      {/* Work / Professional Details */}
      <div>
        <h3 className="text-sm font-semibold text-brand-navy mb-3">Work / Professional Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Occupation" fieldKey="occupation" form={form} onChange={onChange} required validation={validation} placeholder="Your profession or job title" />
        </div>
      </div>
    </div>
  );
}
