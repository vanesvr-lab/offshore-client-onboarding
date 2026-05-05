"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ValidatedLabel, FieldWrapper } from "@/components/shared/ValidatedLabel";
import { CountrySelect } from "@/components/shared/CountrySelect";
import { useFieldValidation } from "@/hooks/useFieldValidation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formWidths } from "@/lib/form-widths";
import { computeAvailableExtracts, computePrefillableFields } from "@/lib/kyc/computePrefillable";
import type { PrefillableField } from "@/lib/kyc/computePrefillable";
import { FieldPrefillIcon } from "@/components/kyc/FieldPrefillIcon";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceRequirement } from "@/types";

interface ResidentialAddressStepProps {
  /** kept for parity with the other step props; reserved for future use. */
  clientId?: string;
  kycRecord: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
  /** B-037 — when true, empty required fields render as red on first paint. */
  showErrorsImmediately?: boolean;
  personDocs?: DocumentRecord[];
  personDocTypes?: DocumentType[];
  /** KYC record id used by the prefill save endpoint. */
  kycRecordId?: string | null;
}

const ADDRESS_FIELDS: (keyof KycRecord)[] = [
  "address_line_1",
  "address_line_2",
  "address_city",
  "address_state",
  "address_postal_code",
  "address_country",
];

export function ResidentialAddressStep({
  kycRecord,
  documents,
  documentTypes,
  requirements,
  form,
  onChange,
  showErrorsImmediately = false,
  personDocs,
  personDocTypes,
  kycRecordId,
}: ResidentialAddressStepProps) {
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
  }).filter((row) => ADDRESS_FIELDS.includes(row.target as keyof KycRecord));
  const availableExtracts = computeAvailableExtracts(prefillInput).filter((row) =>
    ADDRESS_FIELDS.includes(row.target as keyof KycRecord)
  );
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

  // Resolve POA doc type from DD requirements first, fall back to name lookup.
  function resolveDocTypeId(label: string): string | undefined {
    return (
      requirements.find((r) => r.requirement_type === "document" && r.document_types?.name === label)?.document_type_id
      ?? documentTypes.find((dt) => dt.name === label)?.id
    );
  }
  const addressTypeId = resolveDocTypeId("Proof of Residential Address");
  const addressDoc = addressTypeId ? documents.find((d) => d.document_type_id === addressTypeId) : null;

  // B-057 — banner is the single source of truth for prefill feedback on
  // this sub-step. Re-evaluate every time the relevant POA doc changes
  // (new upload, replacement, or the verification result populates after
  // OCR completes). `prefilledFromDocIdRef` keeps the PATCH idempotent
  // across remounts and re-renders.
  type PrefillBannerState = "idle" | "running" | "success" | "error" | "no-source";
  const [bannerState, setBannerState] = useState<PrefillBannerState>("idle");
  const prefilledFromDocIdRef = useRef<string | null>(null);
  const prefillableLength = prefillable.length;
  const availableExtractsLength = availableExtracts.length;

  useEffect(() => {
    // 1. No POA uploaded yet → gentle "no-source" banner.
    if (!addressDoc) {
      setBannerState("no-source");
      prefilledFromDocIdRef.current = null;
      return;
    }

    // 2. POA exists but the AI didn't return any address-relevant value.
    if (availableExtractsLength === 0) {
      setBannerState("error");
      return;
    }

    // 3. POA exists and AI returned values, but every address field is
    //    already populated (the user typed them, or this is a re-mount
    //    after a prior PATCH). Banner shows success without re-saving.
    if (prefillableLength === 0) {
      setBannerState("success");
      return;
    }

    // 4. New extracts available — PATCH the empty fields once per doc.
    if (!effectiveKycRecordId) {
      setBannerState("error");
      return;
    }
    if (prefilledFromDocIdRef.current === addressDoc.id) {
      // Already saved for this exact doc; don't re-fire on every render.
      return;
    }

    prefilledFromDocIdRef.current = addressDoc.id;
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
  }, [
    addressDoc?.id,
    addressDoc?.verification_result,
    prefillableLength,
    availableExtractsLength,
    effectiveKycRecordId,
  ]);

  // B-058 §4 — manual "Pre-fill from uploaded document" trigger. No AI
  // re-run; just applies the existing extraction to the form. Uses
  // `availableExtracts` (not `prefillable`) so it OVERWRITES values the
  // user typed first — the user clicked the button, intent is explicit.
  const [manualPrefilling, setManualPrefilling] = useState(false);
  async function handleManualPrefill() {
    if (!effectiveKycRecordId) return;
    if (availableExtracts.length === 0) {
      toast.info("This document didn't include address details. Please enter them below.");
      return;
    }
    setManualPrefilling(true);
    try {
      const payload: Record<string, string> = {};
      for (const row of availableExtracts) payload[row.target] = row.value;
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
      toast.success(
        `Filled ${availableExtracts.length} field${
          availableExtracts.length === 1 ? "" : "s"
        } from your proof of address.`
      );
    } catch {
      toast.error("Couldn't fill from document — please try again.");
    } finally {
      setManualPrefilling(false);
    }
  }

  function fieldState(key: keyof KycRecord, required: boolean) {
    return validation.getFieldState(key as string, (form[key] ?? "") as string, required);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Residential Address</h2>
        <p className="text-sm text-gray-600">
          Your current home address. We pre-fill these from your proof of address upload when available.
        </p>
      </div>

      {bannerState === "running" && (
        <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-brand-blue shrink-0 animate-spin" />
          <p className="text-sm text-brand-navy">Reading your proof of address…</p>
        </div>
      )}
      {bannerState === "success" && (
        <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-brand-blue shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-brand-navy">Filled from uploaded document</p>
            <p className="text-xs text-gray-600">Values extracted from your proof of address.</p>
          </div>
          {addressDoc && availableExtracts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleManualPrefill()}
              disabled={manualPrefilling}
              className="h-7 text-xs"
            >
              Re-apply
            </Button>
          )}
        </div>
      )}
      {bannerState === "no-source" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 flex items-center gap-2.5">
          <Info className="h-4 w-4 text-gray-500 shrink-0" />
          <p className="text-sm text-gray-700">Upload your proof of address to auto-fill these fields.</p>
        </div>
      )}
      {bannerState === "error" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm text-amber-800">
            Couldn&apos;t auto-fill from your document. Please enter values manually.
          </p>
          {addressDoc && availableExtracts.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleManualPrefill()}
              disabled={manualPrefilling}
              className="h-7 text-xs text-amber-900 hover:bg-amber-100"
            >
              {manualPrefilling ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
              )}
              {manualPrefilling ? "Filling…" : "Pre-fill from uploaded document"}
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {/* Address line 1 — full width */}
        <div className="space-y-1">
          <ValidatedLabel state={fieldState("address_line_1", true)} required>
            Address line 1
            {availableByTarget.get("address_line_1") && (
              <FieldPrefillIcon
                prefillFrom={availableByTarget.get("address_line_1")!}
                fieldLabel="Address line 1"
                onFill={handleFieldPrefill}
              />
            )}
          </ValidatedLabel>
          <FieldWrapper state={fieldState("address_line_1", true)}>
            <Input
              value={(form.address_line_1 ?? "") as string}
              onChange={(e) => onChange({ address_line_1: e.target.value })}
              onBlur={() => validation.markTouched("address_line_1")}
              autoComplete="address-line1"
              placeholder="Street number and name"
              className={`text-sm ${formWidths.full}`}
            />
          </FieldWrapper>
        </div>

        {/* Address line 2 — optional, full width */}
        <div className="space-y-1">
          <ValidatedLabel state={fieldState("address_line_2", false)}>
            Address line 2
            {availableByTarget.get("address_line_2") && (
              <FieldPrefillIcon
                prefillFrom={availableByTarget.get("address_line_2")!}
                fieldLabel="Address line 2"
                onFill={handleFieldPrefill}
              />
            )}
          </ValidatedLabel>
          <FieldWrapper state={fieldState("address_line_2", false)}>
            <Input
              value={(form.address_line_2 ?? "") as string}
              onChange={(e) => onChange({ address_line_2: e.target.value })}
              autoComplete="address-line2"
              placeholder="Apartment, unit, building (optional)"
              className={`text-sm ${formWidths.full}`}
            />
          </FieldWrapper>
        </div>

        {/* City + State row — content-aware widths */}
        <div className="grid grid-cols-1 md:grid-cols-[256px_208px] gap-4">
          <div className="space-y-1">
            <ValidatedLabel state={fieldState("address_city", true)} required>
              City
              {availableByTarget.get("address_city") && (
                <FieldPrefillIcon
                  prefillFrom={availableByTarget.get("address_city")!}
                  fieldLabel="City"
                  onFill={handleFieldPrefill}
                />
              )}
            </ValidatedLabel>
            <FieldWrapper state={fieldState("address_city", true)}>
              <Input
                value={(form.address_city ?? "") as string}
                onChange={(e) => onChange({ address_city: e.target.value })}
                onBlur={() => validation.markTouched("address_city")}
                autoComplete="address-level2"
                placeholder="e.g. Port Louis"
                className={`text-sm ${formWidths.city}`}
              />
            </FieldWrapper>
          </div>
          <div className="space-y-1">
            <ValidatedLabel state={fieldState("address_state", false)}>
              State / Region
              {availableByTarget.get("address_state") && (
                <FieldPrefillIcon
                  prefillFrom={availableByTarget.get("address_state")!}
                  fieldLabel="State / Region"
                  onFill={handleFieldPrefill}
                />
              )}
            </ValidatedLabel>
            <FieldWrapper state={fieldState("address_state", false)}>
              <Input
                value={(form.address_state ?? "") as string}
                onChange={(e) => onChange({ address_state: e.target.value })}
                autoComplete="address-level1"
                placeholder="State, province, or region"
                className={`text-sm ${formWidths.state}`}
              />
            </FieldWrapper>
          </div>
        </div>

        {/* Postal code + Country row */}
        <div className="grid grid-cols-1 md:grid-cols-[96px_240px] gap-4">
          <div className="space-y-1">
            <ValidatedLabel state={fieldState("address_postal_code", false)}>
              Postal code
              {availableByTarget.get("address_postal_code") && (
                <FieldPrefillIcon
                  prefillFrom={availableByTarget.get("address_postal_code")!}
                  fieldLabel="Postal code"
                  onFill={handleFieldPrefill}
                />
              )}
            </ValidatedLabel>
            <FieldWrapper state={fieldState("address_postal_code", false)}>
              <Input
                value={(form.address_postal_code ?? "") as string}
                onChange={(e) => onChange({ address_postal_code: e.target.value })}
                autoComplete="postal-code"
                placeholder="ZIP"
                className={`text-sm ${formWidths.postal}`}
              />
            </FieldWrapper>
          </div>
          <div className="space-y-1">
            <ValidatedLabel state={fieldState("address_country", true)} required>
              Country
              {availableByTarget.get("address_country") && (
                <FieldPrefillIcon
                  prefillFrom={availableByTarget.get("address_country")!}
                  fieldLabel="Country"
                  onFill={handleFieldPrefill}
                />
              )}
            </ValidatedLabel>
            <FieldWrapper state={fieldState("address_country", true)}>
              <div className={formWidths.country}>
                <CountrySelect
                  value={(form.address_country ?? "") as string}
                  onChange={(v) => onChange({ address_country: v })}
                  placeholder="Select country..."
                  onBlur={() => validation.markTouched("address_country")}
                />
              </div>
            </FieldWrapper>
          </div>
        </div>
      </div>
    </div>
  );
}
