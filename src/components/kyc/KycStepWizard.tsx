"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
}

const STEP_LABELS = ["Your Identity", "Financial Profile", "Declarations", "Review & Submit"];

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
}: KycStepWizardProps) {
  const isCdd = dueDiligenceLevel === "cdd" || dueDiligenceLevel === "edd";
  // SDD skips declarations (step index 2)
  const totalSteps = isCdd ? 4 : 3;
  const stepLabels = isCdd ? STEP_LABELS : ["Your Identity", "Financial Profile", "Review & Submit"];

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
      const res = await fetch("/api/kyc/save", {
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
    const markRes = await fetch("/api/kyc/save", {
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

  // Map visual step index to logical step (SDD skips declarations)
  function getLogicalStep(visualStep: number): "identity" | "financial" | "declarations" | "review" {
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
        {logicalStep === "review" && (
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
