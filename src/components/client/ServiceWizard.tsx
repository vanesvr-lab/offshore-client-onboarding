"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ServiceWizardStepIndicator } from "./ServiceWizardStepIndicator";
import { ServiceWizardNav } from "./ServiceWizardNav";
import { ServiceWizardStep } from "./ServiceWizardStep";
import { ServiceWizardPeopleStep } from "./ServiceWizardPeopleStep";
import { ServiceWizardDocumentsStep } from "./ServiceWizardDocumentsStep";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { DueDiligenceRequirement, DocumentType } from "@/types";
import type { ClientServiceRecord, ClientServiceDoc, ServicePerson } from "@/app/(client)/services/[id]/page";

interface Props {
  serviceId: string;
  service: ClientServiceRecord;
  persons: ServicePerson[];
  documents: ClientServiceDoc[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  startStep?: number;
  onClose: (updatedDetails?: Record<string, unknown>, updatedPersons?: ServicePerson[], updatedDocs?: ClientServiceDoc[]) => void;
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
}: Props) {
  const [currentStep, setCurrentStep] = useState(startStep);
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    service.service_details ?? {}
  );
  const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);
  const [documents, setDocuments] = useState<ClientServiceDoc[]>(initialDocuments);
  const [saving, setSaving] = useState(false);

  const serviceFields = (service.service_templates?.service_fields ?? []) as ServiceField[];

  const step0Fields = getFieldsForStep(0, serviceFields);
  const step1Fields = getFieldsForStep(1, serviceFields);
  const step2Fields = getFieldsForStep(2, serviceFields);

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
  if (documents.length > 0) completedSteps.push(4);

  const canSubmit =
    completedSteps.includes(0) &&
    completedSteps.includes(1) &&
    completedSteps.includes(2) &&
    completedSteps.includes(3);

  async function saveServiceDetails(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: serviceDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    // For field steps (0–2), save before advancing
    if (currentStep < 3) {
      const ok = await saveServiceDetails();
      if (!ok) return;
      toast.success("Saved");
    }
    setCurrentStep((s) => Math.min(s + 1, 4));
  }

  async function handleBack() {
    if (currentStep < 3) {
      // Save quietly on back too
      await saveServiceDetails();
    }
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  async function handleSaveAndClose() {
    if (currentStep < 3) {
      const ok = await saveServiceDetails();
      if (!ok) return;
    }
    toast.success("Progress saved");
    onClose(serviceDetails, persons, documents);
  }

  async function handleSubmit() {
    const ok = await saveServiceDetails();
    if (!ok) return;
    // TODO: hit submit endpoint when available
    toast.success("Application submitted for review!");
    onClose(serviceDetails, persons, documents);
  }

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setServiceDetails((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="min-h-[600px] flex flex-col">
      {/* Step indicator */}
      <ServiceWizardStepIndicator
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={(s) => setCurrentStep(s)}
      />

      {/* Step content */}
      <div className="flex-1 pb-20">
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
            onPersonsChange={setPersons}
            requirements={requirements}
            documentTypes={documentTypes}
            onNext={() => setCurrentStep(4)}
          />
        )}
        {currentStep === 4 && (
          <ServiceWizardDocumentsStep
            serviceId={serviceId}
            documents={documents}
            onDocumentsChange={setDocuments}
            requiredDocTypes={requirements
              .filter((r) => r.requirement_type === "document" && r.document_type_id)
              .map((r) => ({
                id: r.document_type_id!,
                name: r.label,
                category: (r as unknown as { document_types?: { name: string } }).document_types?.name ?? r.label,
              }))}
          />
        )}
      </div>

      {/* Sticky nav */}
      <ServiceWizardNav
        currentStep={currentStep}
        totalSteps={5}
        saving={saving}
        canSubmit={canSubmit}
        onSaveAndClose={handleSaveAndClose}
        onBack={handleBack}
        onNext={handleNext}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
