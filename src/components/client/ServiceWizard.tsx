"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ServiceWizardStepIndicator } from "./ServiceWizardStepIndicator";
import { ServiceWizardNav } from "./ServiceWizardNav";
import { ServiceWizardStep } from "./ServiceWizardStep";
import { ServiceWizardPeopleStep } from "./ServiceWizardPeopleStep";
import { ServiceWizardDocumentsStep } from "./ServiceWizardDocumentsStep";
import { SubmitValidationDialog } from "./SubmitValidationDialog";
import { AutosaveIndicator } from "@/components/shared/AutosaveIndicator";
import { useAutosave } from "@/lib/hooks/useAutosave";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { DueDiligenceRequirement, DocumentType } from "@/types";
import type { ClientServiceRecord, ClientServiceDoc, ServicePerson } from "@/app/(client)/services/[id]/page";
import type { ValidationResult } from "@/app/api/services/[id]/validate/route";

interface Props {
  serviceId: string;
  service: ClientServiceRecord;
  persons: ServicePerson[];
  documents: ClientServiceDoc[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  startStep?: number;
  onClose: (updatedDetails?: Record<string, unknown>, updatedPersons?: ServicePerson[], updatedDocs?: ClientServiceDoc[]) => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** B-050 §4.1 — bubbles up `true` when the most recent save attempt
   * exhausted retries. The parent uses this to reword the unsaved-changes
   * dialog and disable "Leave without saving" until the save succeeds. */
  onSaveFailedChange?: (failed: boolean) => void;
  // Lets the parent trigger save+close (e.g. from the unsaved-changes dialog).
  // Resolves true on success, false on save failure.
  saveAndCloseRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}

// Maps step indices to the section names in service_fields
// Step 0 = Company Setup (fields with section "Company Setup", "Details", or no section)
// Step 1 = Financial
// Step 2 = Banking
// Step 3 = People & KYC (special)
// Step 4 = Documents (special)
const STEP_SECTION_MATCH: Record<number, (section: string | undefined) => boolean> = {
  0: (s) => !s || s === "Details" || /company\s*setup/i.test(s) || /company/i.test(s),
  1: (s) => !!s && /financial|finance/i.test(s),
  2: (s) => !!s && /bank/i.test(s),
};

export function getFieldsForStep(step: number, fields: ServiceField[]): ServiceField[] {
  const matcher = STEP_SECTION_MATCH[step];
  if (!matcher) return [];
  return fields.filter((f) => matcher(f.section));
}

function isStepFieldsComplete(fields: ServiceField[], values: Record<string, unknown>): boolean {
  const required = fields.filter((f) => f.required);
  if (required.length === 0) return true;
  return required.every((f) => {
    const v = values[f.key];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== "";
  });
}

export function ServiceWizard({
  serviceId,
  service,
  persons: initialPersons,
  documents: initialDocuments,
  requirements,
  documentTypes,
  startStep = 0,
  onClose,
  onDirtyChange,
  onSaveFailedChange,
  saveAndCloseRef,
}: Props) {
  const [currentStep, setCurrentStep] = useState(startStep);
  const originalDetails = useRef<Record<string, unknown>>(service.service_details ?? {});
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    service.service_details ?? {}
  );
  const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);
  const [documents, setDocuments] = useState<ClientServiceDoc[]>(initialDocuments);
  const autosave = useAutosave();
  const saving = autosave.state === "saving" || autosave.state === "retrying";

  // Bubble up failed-state changes so the parent can adapt the unsaved-changes dialog.
  useEffect(() => {
    onSaveFailedChange?.(autosave.state === "failed");
  }, [autosave.state, onSaveFailedChange]);
  const [hideWizardNav, setHideWizardNav] = useState(false);

  // B-055 §1.2 — Reset nav visibility on every wizard step change so the
  // sticky footer can never be left in a hidden state by a child step
  // (the People step hides it while the user is in per-person Review).
  useEffect(() => {
    setHideWizardNav(false);
  }, [currentStep]);

  const [validationPhase, setValidationPhase] = useState<"loading" | "valid" | "invalid" | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Track dirty state — any field change makes the form dirty
  const isDirty = JSON.stringify(serviceDetails) !== JSON.stringify(originalDetails.current);

  // Notify parent and handle beforeunload when dirty
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const serviceFields = (service.service_templates?.service_fields ?? []) as ServiceField[];

  const step0Fields = getFieldsForStep(0, serviceFields);
  const step1Fields = getFieldsForStep(1, serviceFields);
  const step2Fields = getFieldsForStep(2, serviceFields);

  // B-049 §1.3 — Documents step is application-scope docs only. If the
  // template has none, skip the step entirely so the wizard collapses to 4.
  const applicationScopeRequirements = requirements.filter(
    (r) =>
      r.requirement_type === "document" &&
      r.document_type_id &&
      // Default scope is 'person'. We treat 'application' (and only that) as
      // belonging to the outer Documents step.
      r.document_types?.scope === "application"
  );
  const hasApplicationDocs = applicationScopeRequirements.length > 0;
  const totalSteps = hasApplicationDocs ? 5 : 4;
  const wizardStepLabels = hasApplicationDocs
    ? ["Company Setup", "Financial", "Banking", "People & KYC", "Documents"]
    : ["Company Setup", "Financial", "Banking", "People & KYC"];

  // Determine which steps are "complete" for the step indicator
  const completedSteps: number[] = [];
  if (isStepFieldsComplete(step0Fields, serviceDetails)) completedSteps.push(0);
  if (isStepFieldsComplete(step1Fields, serviceDetails)) completedSteps.push(1);
  if (isStepFieldsComplete(step2Fields, serviceDetails)) completedSteps.push(2);
  const hasDirector = persons.some((p) => p.role === "director");
  const allKycDone = persons.length > 0 && persons.every((p) => {
    const kyc = p.client_profiles?.client_profile_kyc;
    return kyc && (kyc.kyc_journey_completed === true);
  });
  if (hasDirector && (persons.length === 0 || allKycDone)) completedSteps.push(3);
  if (hasApplicationDocs && documents.length > 0) completedSteps.push(4);

  const canSubmit =
    completedSteps.includes(0) &&
    completedSteps.includes(1) &&
    completedSteps.includes(2) &&
    completedSteps.includes(3);

  // B-043 — human-readable reasons why Submit is disabled. Same labels as the step indicator.
  const submitBlockers: string[] = [];
  if (!completedSteps.includes(0)) submitBlockers.push(`${wizardStepLabels[0]} — required fields are incomplete`);
  if (!completedSteps.includes(1)) submitBlockers.push(`${wizardStepLabels[1]} — required fields are incomplete`);
  if (!completedSteps.includes(2)) submitBlockers.push(`${wizardStepLabels[2]} — required fields are incomplete`);
  if (!completedSteps.includes(3)) {
    if (!hasDirector) {
      submitBlockers.push("At least one director must be added in the People step");
    } else if (!allKycDone) {
      submitBlockers.push("All directors, shareholders, and UBOs must complete their KYC");
    }
  }

  async function saveServiceDetails(): Promise<boolean> {
    return autosave.save(async () => {
      try {
        const res = await fetch(`/api/services/${serviceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service_details: serviceDetails }),
        });
        if (!res.ok) return false;
        return true;
      } catch {
        return false;
      }
    });
  }

  async function handleNext() {
    // For field steps (0–2), save before advancing
    if (currentStep < 3) {
      const ok = await saveServiceDetails();
      if (!ok) return;
      toast.success("Saved", { position: "top-right" });
    }
    setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
  }

  async function handleBack() {
    if (currentStep < 3) {
      // Save quietly on back too
      await saveServiceDetails();
    }
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  async function handleSaveAndClose(): Promise<boolean> {
    if (currentStep < 3) {
      const ok = await saveServiceDetails();
      if (!ok) return false;
    }
    originalDetails.current = serviceDetails; // clear dirty
    toast.success("Progress saved", { position: "top-right" });
    onClose(serviceDetails, persons, documents);
    return true;
  }

  // Expose save+close to the parent (used by the unsaved-changes dialog's
  // "Save & Close" button). Re-assigned every render so the closure reflects
  // current state.
  useEffect(() => {
    if (!saveAndCloseRef) return;
    saveAndCloseRef.current = handleSaveAndClose;
    return () => {
      if (saveAndCloseRef.current === handleSaveAndClose) {
        saveAndCloseRef.current = null;
      }
    };
  });

  async function handleSubmit() {
    const ok = await saveServiceDetails();
    if (!ok) return;

    // Show validation dialog
    setValidationPhase("loading");
    setValidationResult(null);

    try {
      const res = await fetch(`/api/services/${serviceId}/validate`, { method: "POST" });
      const data = (await res.json()) as ValidationResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Validation failed");
      setValidationResult(data);
      setValidationPhase(data.valid ? "valid" : "invalid");
    } catch (err: unknown) {
      setValidationPhase(null);
      toast.error(err instanceof Error ? err.message : "Validation failed", { position: "top-right" });
    }
  }

  async function handleConfirmSubmit() {
    setValidationPhase(null);
    // PATCH status to submitted
    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "submitted" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      toast.success("Application submitted for review!", { position: "top-right" });
      onClose(serviceDetails, persons, documents);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit", { position: "top-right" });
    }
  }

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setServiceDetails((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="min-h-[600px] flex flex-col">
      {/* Submit validation overlay */}
      {validationPhase && (
        <SubmitValidationDialog
          phase={validationPhase}
          result={validationResult}
          onConfirmSubmit={handleConfirmSubmit}
          onGoBack={() => setValidationPhase(null)}
          onJumpToSection={(section) => {
            const map: Record<string, number> = {
              "Company Setup": 0,
              "Financial": 1,
              "Banking": 2,
              "People & KYC": 3,
              "Documents": 4,
            };
            const target = map[section];
            if (target != null) {
              setValidationPhase(null);
              setCurrentStep(target);
            }
          }}
        />
      )}
      {/* Step indicator + autosave indicator */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <ServiceWizardStepIndicator
            currentStep={currentStep}
            completedSteps={completedSteps}
            onStepClick={(s) => setCurrentStep(s)}
            labels={wizardStepLabels}
          />
        </div>
        <div className="pt-1 shrink-0">
          <AutosaveIndicator
            state={autosave.state}
            onRetry={() => void autosave.retry()}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 pb-28">
        {currentStep === 0 && (
          <ServiceWizardStep
            fields={step0Fields}
            values={serviceDetails}
            onChange={handleFieldChange}
          />
        )}
        {currentStep === 1 && (
          <ServiceWizardStep
            fields={step1Fields}
            values={serviceDetails}
            onChange={handleFieldChange}
          />
        )}
        {currentStep === 2 && (
          <ServiceWizardStep
            fields={step2Fields}
            values={serviceDetails}
            onChange={handleFieldChange}
          />
        )}
        {currentStep === 3 && (
          <ServiceWizardPeopleStep
            serviceId={serviceId}
            persons={persons}
            documents={documents}
            onPersonsChange={setPersons}
            requirements={requirements}
            documentTypes={documentTypes}
            onNavVisibilityChange={setHideWizardNav}
          />
        )}
        {currentStep === 4 && hasApplicationDocs && (
          <ServiceWizardDocumentsStep
            serviceId={serviceId}
            documents={documents}
            onDocumentsChange={setDocuments}
            submitBlockers={submitBlockers}
            requiredDocTypes={applicationScopeRequirements.map((r) => ({
              id: r.document_type_id!,
              name: r.label,
              category: r.document_types?.category ?? "",
            }))}
          />
        )}
      </div>

      {/* Sticky nav — hidden while in KYC review mode */}
      {!hideWizardNav && (
        <ServiceWizardNav
          currentStep={currentStep}
          totalSteps={totalSteps}
          saving={saving}
          canSubmit={canSubmit}
          submitBlockers={submitBlockers}
          onSaveAndClose={handleSaveAndClose}
          onBack={handleBack}
          onNext={handleNext}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
