"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { ValidatedLabel, FieldWrapper } from "@/components/shared/ValidatedLabel";
import { CountrySelect } from "@/components/shared/CountrySelect";
import { useFieldValidation } from "@/hooks/useFieldValidation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formWidths } from "@/lib/form-widths";
import { computeAvailableExtracts, computePrefillableFields } from "@/lib/kyc/computePrefillable";
import type { PrefillableField } from "@/lib/kyc/computePrefillable";
import { FieldPrefillIcon } from "@/components/kyc/FieldPrefillIcon";
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
  /** When false, hide the email + phone row (handled elsewhere, e.g. ProfileEditPanel). Default: true */
  showContactFields?: boolean;
  /** When true, hide in-step passport + proof of address upload cards (handled in a side panel). Default: false */
  hideDocumentUploads?: boolean;
  /** B-037 — when true, empty required fields render as red on first paint (no need for focus). */
  showErrorsImmediately?: boolean;
  /** B-042 — uploaded documents for the active person (used by the prefill helper). */
  personDocs?: DocumentRecord[];
  /** B-042 — document type definitions in scope for the person's uploads. */
  personDocTypes?: DocumentType[];
  /** B-042 — KYC record id posted to /api/profiles/kyc/save when the user clicks the prefill button. */
  kycRecordId?: string | null;
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
  prefillFrom,
  onPrefillField,
  widthClass,
  autoComplete,
  inputMode,
  helperText,
}: {
  label: string;
  fieldKey: keyof KycRecord;
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  validation: ReturnType<typeof useFieldValidation>;
  prefillFrom?: PrefillableField;
  onPrefillField?: (
    target: string,
    value: string,
    sourceDocLabel: string,
    fieldLabel: string,
  ) => Promise<void>;
  /** Tailwind width class from `formWidths` — applied to the input itself. */
  widthClass?: string;
  /** HTML autocomplete value (`autofill-support`). */
  autoComplete?: string;
  /** inputMode hint for the mobile keyboard (`input-type-keyboard`). */
  inputMode?: "text" | "email" | "tel" | "numeric" | "decimal" | "url";
  /** Persistent helper text shown under the input (replaced by error when present). */
  helperText?: string;
}) {
  const value = (form[fieldKey] ?? "") as string;
  const state = validation.getFieldState(fieldKey as string, value, required);

  return (
    <div className="space-y-1">
      <ValidatedLabel state={state} required={required}>
        {label}
        {prefillFrom && onPrefillField && (
          <FieldPrefillIcon
            prefillFrom={prefillFrom}
            fieldLabel={label}
            onFill={onPrefillField}
          />
        )}
      </ValidatedLabel>
      <FieldWrapper state={state}>
        <Input
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          value={value}
          placeholder={placeholder}
          aria-required={required || undefined}
          onChange={(e) => onChange({ [fieldKey]: e.target.value } as Partial<KycRecord>)}
          onBlur={() => validation.markTouched(fieldKey as string)}
          className={`text-sm ${widthClass ?? ""}`.trim()}
        />
      </FieldWrapper>
      {helperText && state !== "error" && (
        <p className="text-xs text-gray-600">{helperText}</p>
      )}
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
  showContactFields = true,
  hideDocumentUploads = false,
  showErrorsImmediately = false,
  personDocs,
  personDocTypes,
  kycRecordId,
}: IdentityStepProps) {
  const validation = useFieldValidation({ showErrorsImmediately });

  const prefillableDocs = personDocs ?? documents;
  const prefillableDocTypes = personDocTypes ?? documentTypes;
  const effectiveKycRecordId = kycRecordId ?? kycRecord.id ?? null;

  const prefillInput = {
    docs: prefillableDocs.map((d) => ({
      id: d.id,
      document_type_id: d.document_type_id ?? null,
      uploaded_at: d.uploaded_at ?? null,
      verification_result: (d.verification_result ?? null) as {
        extracted_fields?: Record<string, unknown> | null;
      } | null,
    })),
    docTypes: prefillableDocTypes.map((t) => ({
      id: t.id,
      name: t.name,
      ai_extraction_fields: t.ai_extraction_fields ?? null,
    })),
  };
  const prefillable = computePrefillableFields({
    form: form as Record<string, unknown>,
    docs: prefillInput.docs,
    docTypes: prefillInput.docTypes,
  });
  const availableExtracts = computeAvailableExtracts(prefillInput);
  const availableByTarget = new Map<string, PrefillableField>();
  for (const row of availableExtracts) availableByTarget.set(row.target, row);

  async function handleFieldPrefill(
    target: string,
    value: string,
    sourceDocLabel: string,
    fieldLabel: string,
  ) {
    if (!effectiveKycRecordId) {
      toast.error("Couldn't fill from document — please try again.");
      return;
    }
    try {
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId: effectiveKycRecordId, fields: { [target]: value } }),
      });
      if (!res.ok) throw new Error("save failed");
      onChange({ [target]: value } as Partial<KycRecord>);
      toast.success(`Filled ${fieldLabel} from ${sourceDocLabel}.`);
    } catch {
      toast.error("Couldn't fill from document — please try again.");
    }
  }

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

  // B-046 batch 5 — Auto-trigger prefill on mount, replace clickable CTA with passive banner.
  type PrefillBannerState = "idle" | "running" | "success" | "error" | "no-source";
  const [bannerState, setBannerState] = useState<PrefillBannerState>("idle");
  const prefillFiredRef = useRef(false);

  useEffect(() => {
    if (prefillFiredRef.current) return;
    prefillFiredRef.current = true;

    const hasSourceDoc = !!(passportDoc || addressDoc);
    if (!hasSourceDoc) {
      setBannerState("no-source");
      return;
    }
    // Source doc exists but nothing left to apply (already filled previously).
    if (prefillable.length === 0) {
      if (availableExtracts.length > 0) setBannerState("success");
      else setBannerState("error"); // doc uploaded but extraction empty — OCR failed
      return;
    }
    if (!effectiveKycRecordId) {
      setBannerState("error");
      return;
    }

    void (async () => {
      setBannerState("running");
      try {
        const payload: Record<string, string> = {};
        for (const row of prefillable) payload[row.target] = row.value;
        const res = await fetch("/api/profiles/kyc/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kycRecordId: effectiveKycRecordId, fields: payload }),
        });
        if (!res.ok) throw new Error("save failed");
        const patch: Partial<KycRecord> = {};
        for (const [k, v] of Object.entries(payload)) {
          (patch as Record<string, unknown>)[k] = v;
        }
        onChange(patch);
        setBannerState("success");
      } catch {
        setBannerState("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Your Identity</h2>
        <p className="text-sm text-gray-600">Please provide your identity information and upload your passport and proof of address.</p>
      </div>

      {bannerState === "running" && (
        <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-brand-blue shrink-0 animate-spin" />
          <p className="text-sm text-brand-navy">Reading your document…</p>
        </div>
      )}
      {bannerState === "success" && (
        <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-brand-blue shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-brand-navy">Filled from uploaded document</p>
            <p className="text-xs text-gray-600">Values extracted from your passport / ID.</p>
          </div>
        </div>
      )}
      {bannerState === "no-source" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 flex items-center gap-2.5">
          <Info className="h-4 w-4 text-gray-500 shrink-0" />
          <p className="text-sm text-gray-700">Upload your passport or ID to auto-fill these fields.</p>
        </div>
      )}
      {bannerState === "error" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            Couldn&apos;t auto-fill from your document. Please enter values manually.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Full legal name"
          fieldKey="full_name"
          form={form}
          onChange={onChange}
          required
          validation={validation}
          placeholder="As it appears on your passport"
          autoComplete="name"
          widthClass={formWidths.fullName}
          prefillFrom={availableByTarget.get("full_name")}
          onPrefillField={handleFieldPrefill}
        />
        <Field
          label="Aliases / other names"
          fieldKey="aliases"
          form={form}
          onChange={onChange}
          validation={validation}
          placeholder="Maiden name, nicknames, etc."
          autoComplete="off"
          widthClass={formWidths.fullName}
        />
        <Field
          label="Date of birth"
          fieldKey="date_of_birth"
          form={form}
          onChange={onChange}
          type="date"
          required
          validation={validation}
          autoComplete="bday"
          widthClass={formWidths.date}
          prefillFrom={availableByTarget.get("date_of_birth")}
          onPrefillField={handleFieldPrefill}
        />
        <div className="space-y-1">
          <ValidatedLabel
            state={validation.getFieldState("nationality", (form.nationality ?? "") as string, true)}
            required
          >
            Nationality
            {availableByTarget.get("nationality") && (
              <FieldPrefillIcon
                prefillFrom={availableByTarget.get("nationality")!}
                fieldLabel="Nationality"
                onFill={handleFieldPrefill}
              />
            )}
          </ValidatedLabel>
          <FieldWrapper state={validation.getFieldState("nationality", (form.nationality ?? "") as string, true)}>
            <div className={formWidths.country}>
              <CountrySelect
                value={(form.nationality ?? "") as string}
                onChange={(v) => onChange({ nationality: v })}
                placeholder="Select nationality..."
                onBlur={() => validation.markTouched("nationality")}
              />
            </div>
          </FieldWrapper>
        </div>
        <div className="space-y-1">
          <ValidatedLabel
            state={validation.getFieldState("passport_country", (form.passport_country ?? "") as string, true)}
            required
          >
            Passport country
            {availableByTarget.get("passport_country") && (
              <FieldPrefillIcon
                prefillFrom={availableByTarget.get("passport_country")!}
                fieldLabel="Passport country"
                onFill={handleFieldPrefill}
              />
            )}
          </ValidatedLabel>
          <FieldWrapper state={validation.getFieldState("passport_country", (form.passport_country ?? "") as string, true)}>
            <div className={formWidths.country}>
              <CountrySelect
                value={(form.passport_country ?? "") as string}
                onChange={(v) => onChange({ passport_country: v })}
                placeholder="Country that issued your passport..."
                onBlur={() => validation.markTouched("passport_country")}
              />
            </div>
          </FieldWrapper>
        </div>
        <Field
          label="Passport number"
          fieldKey="passport_number"
          form={form}
          onChange={onChange}
          required
          validation={validation}
          autoComplete="off"
          widthClass={formWidths.identifier}
          prefillFrom={availableByTarget.get("passport_number")}
          onPrefillField={handleFieldPrefill}
        />
        <Field
          label="Passport expiry date"
          fieldKey="passport_expiry"
          form={form}
          onChange={onChange}
          type="date"
          required
          validation={validation}
          widthClass={formWidths.date}
          prefillFrom={availableByTarget.get("passport_expiry")}
          onPrefillField={handleFieldPrefill}
        />
      </div>

      {/* Passport upload */}
      {!hideDocumentUploads && (
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
      )}

      <div>
        <div className="space-y-1">
          <ValidatedLabel state={validation.getFieldState("address", (form.address ?? "") as string, true)} required>
            Residential address
            {availableByTarget.get("address") && (
              <FieldPrefillIcon
                prefillFrom={availableByTarget.get("address")!}
                fieldLabel="Residential address"
                onFill={handleFieldPrefill}
              />
            )}
          </ValidatedLabel>
          <FieldWrapper state={validation.getFieldState("address", (form.address ?? "") as string, true)}>
            <Textarea
              value={(form.address ?? "") as string}
              onChange={(e) => onChange({ address: e.target.value })}
              onBlur={() => validation.markTouched("address")}
              rows={2}
              autoComplete="street-address"
              placeholder="Full residential address including country"
              className="text-sm resize-none max-w-2xl"
            />
          </FieldWrapper>
        </div>
      </div>

      {/* Proof of address upload */}
      {!hideDocumentUploads && (
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
      )}

      {showContactFields && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_192px] gap-4">
          <Field
            label="Email address"
            fieldKey="email"
            form={form}
            onChange={onChange}
            type="email"
            inputMode="email"
            autoComplete="email"
            widthClass={formWidths.email}
            required
            validation={validation}
          />
          <Field
            label="Phone number"
            fieldKey="phone"
            form={form}
            onChange={onChange}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            widthClass={formWidths.phone}
            validation={validation}
          />
        </div>
      )}
    </div>
  );
}
