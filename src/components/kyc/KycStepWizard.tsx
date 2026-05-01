"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IdentityStep } from "./steps/IdentityStep";
import { FinancialStep } from "./steps/FinancialStep";
import { DeclarationsStep } from "./steps/DeclarationsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { computePrefillableFields } from "@/lib/kyc/computePrefillable";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

interface KycStepWizardProps {
  clientId: string;
  kycRecord: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  dueDiligenceLevel: DueDiligenceLevel;
  requirements: DueDiligenceRequirement[];
  onComplete: () => void;
  /** compact=true: removes sticky nav padding, skips page scroll, reduces min-height */
  compact?: boolean;
  /** Override the save API URL (default: /api/kyc/save) */
  saveUrl?: string;
  /** If true, final step shows "Save & Close" instead of "Submit for Review" */
  inlineMode?: boolean;
  /** Switch between individual and corporation KYC steps */
  profileType?: "individual" | "organisation";
  /** When false, IdentityStep hides the email + phone row (handled by a surrounding ProfileEditPanel). Default: true */
  showContactFields?: boolean;
  /** When true, all step-level document upload cards are hidden (handled by a surrounding KycDocListPanel). Default: false */
  hideDocumentUploads?: boolean;
  /** B-037 — when true, empty required fields render as red on first paint. Default: false (preserves admin behaviour). */
  showErrorsImmediately?: boolean;
  /** B-039 — when true, render the Back / Save & Continue bar fixed to viewport bottom so it is always visible. */
  fixedNav?: boolean;
  /** B-042 — uploaded documents for the active person (used to detect AI-extracted data ready to drop into the form). */
  personDocs?: DocumentRecord[];
  /** B-042 — document type definitions for the docs above (so the prefill helper can read ai_extraction_fields). */
  personDocTypes?: DocumentType[];
  /** B-043 — parent registers a flush callback so it can save pending edits before navigating away. */
  onRegisterFlush?: (flush: (() => Promise<boolean>) | null) => void;
  /**
   * B-046 — when set, the wizard runs as part of a "Review all KYC" walk.
   * The final-step button becomes "Save" / "Save & Finish" (with a chevron),
   * and a header inside the wizard shows the user's place in the walk.
   * Implies inlineMode behaviour (no submit-for-review on the last step).
   */
  reviewAllContext?: {
    current: number;
    total: number;
    personName?: string | null;
    onAdvance: () => void;
  };
}

const STEP_LABELS = ["Your Identity", "Financial Profile", "Declarations", "Review & Submit"];
const ORG_STEP_LABELS = ["Company Details", "Tax / Financial", "Review & Submit"];

// ─── Corporation step components ─────────────────────────────────────────────

function OrgField({
  label,
  fieldKey,
  form,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  fieldKey: keyof KycRecord;
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-sm">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      {type === "textarea" ? (
        <Textarea
          value={(form[fieldKey] as string) ?? ""}
          onChange={(e) => onChange({ [fieldKey]: e.target.value } as Partial<KycRecord>)}
          placeholder={placeholder}
          rows={3}
          className="text-sm resize-none"
        />
      ) : (
        <Input
          type={type}
          value={(form[fieldKey] as string) ?? ""}
          onChange={(e) => onChange({ [fieldKey]: e.target.value } as Partial<KycRecord>)}
          placeholder={placeholder}
          className="text-sm"
        />
      )}
    </div>
  );
}

function CompanyDetailsStep({
  form,
  onChange,
}: {
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Company Details</h2>
        <p className="text-sm text-gray-500">Provide information about the company entity.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OrgField label="Company name" fieldKey="full_name" form={form} onChange={onChange} required placeholder="Legal entity name" />
        <OrgField label="Registration number" fieldKey="company_registration_number" form={form} onChange={onChange} required placeholder="Company registration number" />
        <OrgField label="Jurisdiction of incorporation" fieldKey="jurisdiction_incorporated" form={form} onChange={onChange} required placeholder="e.g. Mauritius" />
        <OrgField label="Date of incorporation" fieldKey="date_of_incorporation" form={form} onChange={onChange} type="date" required />
        <OrgField label="Industry sector" fieldKey="industry_sector" form={form} onChange={onChange} placeholder="e.g. Financial Services" />
        <div className="space-y-1">
          <Label className="text-sm">Listed or unlisted</Label>
          <select
            value={(form.listed_or_unlisted as string) ?? ""}
            onChange={(e) => onChange({ listed_or_unlisted: (e.target.value || null) as "listed" | "unlisted" | null })}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Select…</option>
            <option value="listed">Listed</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <OrgField label="Business description" fieldKey="description_activity" form={form} onChange={onChange} type="textarea" placeholder="Describe the company's main activities" />
        </div>
      </div>
    </div>
  );
}

function CorporateTaxStep({
  form,
  onChange,
}: {
  form: Partial<KycRecord>;
  onChange: (fields: Partial<KycRecord>) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Tax / Financial</h2>
        <p className="text-sm text-gray-500">Provide tax residency and financial details.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OrgField label="Tax residency jurisdiction" fieldKey="jurisdiction_tax_residence" form={form} onChange={onChange} placeholder="e.g. Mauritius" />
        <OrgField label="Tax identification number" fieldKey="tax_identification_number" form={form} onChange={onChange} placeholder="TIN or equivalent" />
        <div className="md:col-span-2">
          <OrgField label="Regulatory licences" fieldKey="regulatory_licenses" form={form} onChange={onChange} type="textarea" placeholder="List any regulatory licences held" />
        </div>
      </div>
    </div>
  );
}

function OrgReviewStep({ form }: { form: Partial<KycRecord> }) {
  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Company name", value: form.full_name },
    { label: "Registration number", value: form.company_registration_number },
    { label: "Jurisdiction of incorporation", value: form.jurisdiction_incorporated },
    { label: "Date of incorporation", value: form.date_of_incorporation },
    { label: "Industry sector", value: form.industry_sector },
    { label: "Listed / unlisted", value: form.listed_or_unlisted },
    { label: "Business description", value: form.description_activity },
    { label: "Tax residency", value: form.jurisdiction_tax_residence },
    { label: "Tax identification number", value: form.tax_identification_number },
    { label: "Regulatory licences", value: form.regulatory_licenses },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Review & Submit</h2>
        <p className="text-sm text-gray-500">Review the information below before submitting.</p>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-3 py-1.5">
            <span className="text-xs text-gray-500 w-48 shrink-0">{label}</span>
            {value ? (
              <span className="text-xs text-gray-800">{value}</span>
            ) : (
              <span className="text-xs text-red-400 italic">Not provided</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepIndicator({
  current,
  total,
  labels,
  identityStepIndex,
  showIdentityPrefillHint,
}: {
  current: number;
  total: number;
  labels: string[];
  identityStepIndex?: number;
  showIdentityPrefillHint?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => {
          const isIdentity = identityStepIndex !== undefined && i === identityStepIndex;
          return (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className="relative flex-1">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i < current ? "bg-brand-accent" : i === current ? "bg-brand-navy" : "bg-gray-200"
                  }`}
                />
                {isIdentity && showIdentityPrefillHint && (
                  <span
                    className="absolute -top-2 -right-1 inline-flex items-center"
                    title="AI-extracted data is available — fill it in from the Identity step."
                  >
                    <Sparkles className="h-3 w-3 text-blue-500" />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">
        Step {current + 1} of {total} — <span className="font-medium text-brand-navy">{labels[current]}</span>
      </p>
    </div>
  );
}

export function KycStepWizard({
  clientId,
  kycRecord,
  documents: initialDocuments,
  documentTypes,
  dueDiligenceLevel,
  requirements,
  onComplete,
  compact = false,
  saveUrl = "/api/kyc/save",
  inlineMode = false,
  profileType = "individual",
  showContactFields = true,
  hideDocumentUploads = false,
  showErrorsImmediately = false,
  fixedNav = false,
  personDocs,
  personDocTypes,
  onRegisterFlush,
  reviewAllContext,
}: KycStepWizardProps) {
  const isOrg = profileType === "organisation";
  const isCdd = !isOrg && (dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd");
  // Organisation: always 3 steps (Company Details → Tax/Financial → Review)
  // Individual SDD: 3 steps (skips declarations)
  // Individual CDD/EDD: 4 steps
  const totalSteps = isOrg ? 3 : (isCdd ? 4 : 3);
  const stepLabels = isOrg ? ORG_STEP_LABELS : (isCdd ? STEP_LABELS : ["Your Identity", "Financial Profile", "Review & Submit"]);

  const [currentStep, setCurrentStep] = useState(0);
  const [form, setForm] = useState<Partial<KycRecord>>(kycRecord);
  const [documents, setDocuments] = useState<DocumentRecord[]>(initialDocuments);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback((fields: Partial<KycRecord>) => {
    setForm((prev) => ({ ...prev, ...fields }));
  }, []);

  const handleDocumentUploaded = useCallback((doc: DocumentRecord) => {
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.document_type_id === doc.document_type_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = doc;
        return next;
      }
      return [...prev, doc];
    });
  }, []);

  const saveCurrentStep = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(saveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId: kycRecord.id, fields: form }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  }, [saveUrl, kycRecord.id, form]);

  // B-043 — expose saveCurrentStep to the parent so it can flush pending edits
  // before navigating away (e.g. "Back to People" exits the KYC review panel).
  useEffect(() => {
    if (!onRegisterFlush) return;
    onRegisterFlush(saveCurrentStep);
    return () => onRegisterFlush(null);
  }, [onRegisterFlush, saveCurrentStep]);

  async function handleNext() {
    const ok = await saveCurrentStep();
    if (!ok) return;
    setCurrentStep((s) => s + 1);
    if (!compact) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleBack() {
    // Save without blocking on error
    await saveCurrentStep();
    setCurrentStep((s) => s - 1);
    if (!compact) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    const saved = await saveCurrentStep();
    if (!saved) return;

    // Mark journey completed before submitting
    const markRes = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kycRecordId: kycRecord.id, fields: { kyc_journey_completed: true } }),
    });
    if (!markRes.ok) {
      toast.error("Failed to complete journey");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json() as { error?: string; errors?: string[] };
      if (!res.ok) {
        if (data.errors?.length) {
          toast.error(`Please complete the following: ${data.errors.slice(0, 3).join("; ")}`);
        } else {
          throw new Error(data.error ?? "Submit failed");
        }
        return;
      }
      toast.success("KYC submitted for review");
      onComplete();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Map visual step index to logical step
  function getLogicalStep(visualStep: number): "identity" | "financial" | "declarations" | "review" | "org_details" | "org_tax" {
    if (isOrg) {
      if (visualStep === 0) return "org_details";
      if (visualStep === 1) return "org_tax";
      return "review";
    }
    if (visualStep === 0) return "identity";
    if (visualStep === 1) return "financial";
    if (!isCdd) return "review"; // step 2 is review for SDD
    if (visualStep === 2) return "declarations";
    return "review";
  }

  const logicalStep = getLogicalStep(currentStep);
  const isLastStep = currentStep === totalSteps - 1;

  // B-042 — surface a ✨ on the Identity step circle when there is AI-extracted
  // data still missing from the form. Only meaningful for the individual flow.
  const identityStepIndex = isOrg ? undefined : 0;
  const prefillDocs = personDocs ?? documents;
  const prefillDocTypes = personDocTypes ?? documentTypes;
  const prefillableSummary = useMemo(
    () =>
      isOrg
        ? []
        : computePrefillableFields({
            form: form as Record<string, unknown>,
            docs: prefillDocs.map((d) => ({
              id: d.id,
              document_type_id: d.document_type_id ?? null,
              uploaded_at: d.uploaded_at ?? null,
              verification_result: (d.verification_result ?? null) as {
                extracted_fields?: Record<string, unknown> | null;
              } | null,
            })),
            docTypes: prefillDocTypes.map((t) => ({
              id: t.id,
              name: t.name,
              ai_extraction_fields: t.ai_extraction_fields ?? null,
            })),
          }),
    [isOrg, form, prefillDocs, prefillDocTypes]
  );
  const showIdentityPrefillHint = prefillableSummary.length > 0;

  return (
    <div className="space-y-6">
      {/* B-046 — review-all walk-through header */}
      {reviewAllContext && (
        <div className="flex items-center justify-between rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-2">
          <p className="text-sm">
            <span className="text-gray-500">Reviewing person {reviewAllContext.current + 1} of {reviewAllContext.total}</span>
            {reviewAllContext.personName && (
              <>
                {" "}—{" "}
                <span className="font-semibold text-brand-navy">{reviewAllContext.personName}</span>
              </>
            )}
          </p>
          <span className="text-xs text-gray-400">
            {reviewAllContext.current + 1 < reviewAllContext.total
              ? `${reviewAllContext.total - reviewAllContext.current - 1} remaining`
              : "Last person"}
          </span>
        </div>
      )}

      <StepIndicator
        current={currentStep}
        total={totalSteps}
        labels={stepLabels}
        identityStepIndex={identityStepIndex}
        showIdentityPrefillHint={showIdentityPrefillHint}
      />

      <div className={compact ? "min-h-[200px]" : "min-h-[400px]"}>
        {logicalStep === "org_details" && (
          <CompanyDetailsStep form={form} onChange={handleChange} />
        )}
        {logicalStep === "org_tax" && (
          <CorporateTaxStep form={form} onChange={handleChange} />
        )}
        {logicalStep === "review" && isOrg && (
          <OrgReviewStep form={form} />
        )}
        {logicalStep === "identity" && (
          <IdentityStep
            clientId={clientId}
            kycRecord={kycRecord}
            documents={documents}
            documentTypes={documentTypes}
            requirements={requirements}
            form={form}
            onChange={handleChange}
            onDocumentUploaded={handleDocumentUploaded}
            showContactFields={showContactFields}
            hideDocumentUploads={hideDocumentUploads}
            showErrorsImmediately={showErrorsImmediately}
            personDocs={prefillDocs}
            personDocTypes={prefillDocTypes}
            kycRecordId={kycRecord.id}
          />
        )}
        {logicalStep === "financial" && (
          <FinancialStep
            clientId={clientId}
            kycRecord={kycRecord}
            documents={documents}
            documentTypes={documentTypes}
            dueDiligenceLevel={dueDiligenceLevel}
            requirements={requirements}
            form={form}
            onChange={handleChange}
            onDocumentUploaded={handleDocumentUploaded}
            hideDocumentUploads={hideDocumentUploads}
            showErrorsImmediately={showErrorsImmediately}
          />
        )}
        {logicalStep === "declarations" && (
          <DeclarationsStep
            clientId={clientId}
            kycRecord={kycRecord}
            documents={documents}
            documentTypes={documentTypes}
            dueDiligenceLevel={dueDiligenceLevel}
            requirements={requirements}
            form={form}
            onChange={handleChange}
            onDocumentUploaded={handleDocumentUploaded}
            hideDocumentUploads={hideDocumentUploads}
            showErrorsImmediately={showErrorsImmediately}
          />
        )}
        {logicalStep === "review" && !isOrg && (
          <ReviewStep
            kycRecord={kycRecord}
            documents={documents}
            documentTypes={documentTypes}
            dueDiligenceLevel={dueDiligenceLevel}
            requirements={requirements}
            form={form}
          />
        )}
      </div>

      {/* Spacer reserves room at the bottom of the page so fixed nav never covers final fields */}
      {fixedNav && <div aria-hidden className="h-28" />}

      {/* B-047 §4 — three-tier button hierarchy. Back = tertiary (text link),
          primary action (Submit / Save & Continue) = brand-navy 44pt. */}
      <div className={
        fixedNav
          ? "fixed bottom-6 left-[260px] right-0 z-40 bg-white border-t border-x rounded-t-lg shadow-[0_-2px_8px_rgba(0,0,0,0.04)] px-6 py-3 flex items-center justify-between"
          : compact
            ? "flex items-center justify-between pt-4 border-t mt-6"
            : "sticky bottom-0 bg-white border-t px-4 py-4 -mx-8 -mb-8 flex items-center justify-between"
      }>
        <Button
          onClick={handleBack}
          disabled={currentStep === 0 || saving}
          className="h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent gap-1"
          aria-label="Back to previous step"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        {isLastStep ? (
          reviewAllContext ? (
            <Button
              onClick={async () => {
                const ok = await saveCurrentStep();
                if (!ok) return;
                if (reviewAllContext.current + 1 < reviewAllContext.total) {
                  reviewAllContext.onAdvance();
                } else {
                  onComplete();
                }
              }}
              disabled={saving}
              className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90 gap-1"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
              ) : (
                <>
                  {reviewAllContext.current + 1 < reviewAllContext.total ? "Save" : "Save & Finish"}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          ) : inlineMode ? (
            <Button
              onClick={async () => {
                const ok = await saveCurrentStep();
                if (ok) onComplete();
              }}
              disabled={saving}
              className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90 gap-1"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save & Close"}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || saving}
              className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90 gap-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit for Review"
              )}
            </Button>
          )
        ) : (
          <Button
            onClick={handleNext}
            disabled={saving}
            className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90 gap-1"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Save & Continue
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
