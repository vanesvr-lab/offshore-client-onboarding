"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IdentityStep } from "./steps/IdentityStep";
import { FinancialStep } from "./steps/FinancialStep";
import { DeclarationsStep } from "./steps/DeclarationsStep";
import { ReviewStep } from "./steps/ReviewStep";
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

function StepIndicator({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div
              className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                i < current ? "bg-brand-accent" : i === current ? "bg-brand-navy" : "bg-gray-200"
              }`}
            />
          </div>
        ))}
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

  async function saveCurrentStep() {
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
  }

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

  return (
    <div className="space-y-6">
      <StepIndicator current={currentStep} total={totalSteps} labels={stepLabels} />

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

      {/* Navigation */}
      <div className={compact
        ? "flex items-center justify-between pt-4 border-t mt-6"
        : "sticky bottom-0 bg-white border-t px-4 py-4 -mx-8 -mb-8 flex items-center justify-between"
      }>
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0 || saving}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        {isLastStep ? (
          inlineMode ? (
            <Button
              onClick={async () => {
                const ok = await saveCurrentStep();
                if (ok) onComplete();
              }}
              disabled={saving}
              className="bg-brand-navy hover:bg-brand-blue gap-1"
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save & Close"}
            </Button>
          ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || saving}
            className="bg-brand-navy hover:bg-brand-blue gap-1"
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
            className="bg-brand-navy hover:bg-brand-blue gap-1"
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
