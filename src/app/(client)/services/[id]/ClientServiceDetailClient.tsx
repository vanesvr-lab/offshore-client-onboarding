"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  ChevronRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceWizard, getFieldsForStep } from "@/components/client/ServiceWizard";
import { getClientStatusLabel } from "@/lib/utils/clientLabels";
import type {
  ServiceSectionOverride,
  DueDiligenceRequirement,
  DocumentType,
  ServiceTemplateDocument,
} from "@/types";
import type { ClientServiceRecord, ClientServiceDoc, ServicePerson } from "./page";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

interface Props {
  service: ClientServiceRecord;
  documents: ClientServiceDoc[];
  overrides?: ServiceSectionOverride[];
  persons: ServicePerson[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  templateDocs: ServiceTemplateDocument[];
  myRole: string;
  autoWizardStep?: number;
}

// ─── Section completion helpers ──────────────────────────────────────────────

function isFieldStepComplete(stepIndex: number, serviceFields: ServiceField[], serviceDetails: Record<string, unknown>): boolean {
  const fields = getFieldsForStep(stepIndex, serviceFields);
  const required = fields.filter((f) => f.required);
  if (required.length === 0 && fields.length === 0) return true; // no fields for this step = auto-complete
  if (required.length === 0) {
    // No required fields — check if any are filled
    return fields.some((f) => {
      const v = serviceDetails[f.key];
      return Array.isArray(v) ? v.length > 0 : v != null && v !== "";
    });
  }
  return required.every((f) => {
    const v = serviceDetails[f.key];
    return Array.isArray(v) ? v.length > 0 : v != null && v !== "";
  });
}

function isPeopleComplete(persons: ServicePerson[]): boolean {
  if (persons.length === 0) return false;
  const hasDirector = persons.some((p) => p.role === "director");
  if (!hasDirector) return false;
  return persons.every((p) => {
    const kyc = p.client_profiles?.client_profile_kyc;
    return kyc && (kyc.kyc_journey_completed === true);
  });
}

function isDocumentsComplete(documents: ClientServiceDoc[]): boolean {
  return documents.length > 0 && documents.every((d) => d.verification_status !== "flagged" && d.verification_status !== "rejected");
}

// ─── Section row in the checklist ────────────────────────────────────────────

const SECTION_CONFIG = [
  { label: "Company Setup",  stepIndex: 0 },
  { label: "Financial",      stepIndex: 1 },
  { label: "Banking",        stepIndex: 2 },
  { label: "People & KYC",  stepIndex: 3 },
  { label: "Documents",      stepIndex: 4 },
];

function SectionRow({
  label,
  complete,
  onReview,
}: {
  label: string;
  complete: boolean;
  onReview: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        {complete ? (
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-gray-800">{label}</span>
        <span className={`text-xs font-medium ${complete ? "text-green-600" : "text-red-500"}`}>
          {complete ? "Complete" : "Incomplete"}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onReview}
        className="text-xs h-7 px-2.5 gap-1"
      >
        Review
        <ChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Status icon ─────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  return getClientStatusLabel(status);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ClientServiceDetailClient({
  service,
  documents,
  persons,
  requirements,
  documentTypes,
  templateDocs,
  myRole,
  autoWizardStep,
}: Props) {
  const [wizardMode, setWizardMode] = useState(autoWizardStep != null);
  const [wizardStartStep, setWizardStartStep] = useState(autoWizardStep ?? 0);
  const [wizardIsDirty, setWizardIsDirty] = useState(false);
  const [wizardSaveFailed, setWizardSaveFailed] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [savingFromDialog, setSavingFromDialog] = useState(false);
  const wizardSaveAndCloseRef = useRef<(() => Promise<boolean>) | null>(null);
  // Track live updates from wizard
  const [livePersons, setLivePersons] = useState<ServicePerson[]>(persons);
  const [liveDocs, setLiveDocs] = useState<ClientServiceDoc[]>(documents);
  const [liveServiceDetails, setLiveServiceDetails] = useState<Record<string, unknown>>(
    service.service_details ?? {}
  );

  const serviceFields = (service.service_templates?.service_fields ?? []) as ServiceField[];

  // Compute completion status for each section
  const section0Complete = isFieldStepComplete(0, serviceFields, liveServiceDetails);
  const section1Complete = isFieldStepComplete(1, serviceFields, liveServiceDetails);
  const section2Complete = isFieldStepComplete(2, serviceFields, liveServiceDetails);
  const section3Complete = isPeopleComplete(livePersons);
  const section4Complete = isDocumentsComplete(liveDocs);

  const allComplete = section0Complete && section1Complete && section2Complete && section3Complete && section4Complete;

  const sectionCompletion = [section0Complete, section1Complete, section2Complete, section3Complete, section4Complete];

  function openWizard(step: number) {
    setWizardStartStep(step);
    setWizardMode(true);
  }

  // ─── Wizard mode ───────────────────────────────────────────────────────────
  if (wizardMode) {
    // Build a merged service object with live details
    const serviceWithLive: ClientServiceRecord = {
      ...service,
      service_details: liveServiceDetails,
    };

    return (
      <div className="mx-auto w-full max-w-2xl">
        {/* B-047 §4 — Unsaved changes dialog. One Primary (Save & Close = brand-navy);
            "Leave without saving" is destructive-tertiary (text only); "Stay" is the
            secondary outline. */}
        {showUnsavedWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4 space-y-4">
              <h2 className="font-semibold text-brand-navy text-base">Unsaved changes</h2>
              <p className="text-sm text-gray-600">
                {wizardSaveFailed
                  ? "You have unsaved changes that haven't been saved to the server. Try Save & Close, or check your connection."
                  : "You have unsaved changes. What would you like to do?"}
              </p>
              <div className="flex gap-2 justify-end flex-wrap">
                <button
                  onClick={() => { setShowUnsavedWarning(false); setWizardMode(false); }}
                  disabled={savingFromDialog || wizardSaveFailed}
                  title={wizardSaveFailed ? "Can't leave — your latest save failed. Use Save & Close." : undefined}
                  className="h-11 px-3 text-sm font-medium rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Leave without saving
                </button>
                <button
                  onClick={() => setShowUnsavedWarning(false)}
                  disabled={savingFromDialog}
                  className="h-11 px-5 text-sm font-medium rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Stay
                </button>
                <button
                  onClick={async () => {
                    if (savingFromDialog) return;
                    const handler = wizardSaveAndCloseRef.current;
                    if (!handler) {
                      // Fallback — no wizard handler registered. Just close.
                      setShowUnsavedWarning(false);
                      setWizardMode(false);
                      return;
                    }
                    setSavingFromDialog(true);
                    try {
                      const ok = await handler();
                      if (ok) setShowUnsavedWarning(false);
                      // On failure: handler shows its own toast. Keep dialog open.
                    } finally {
                      setSavingFromDialog(false);
                    }
                  }}
                  disabled={savingFromDialog}
                  className="h-11 px-5 text-sm font-semibold rounded-lg bg-brand-navy text-white hover:bg-brand-navy/90 disabled:opacity-50"
                >
                  {savingFromDialog ? "Saving…" : "Save & Close"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* B-047 §4.4 — back-navigation demoted to gray-600 link, smaller chevron. */}
        <button
          onClick={() => {
            if (wizardIsDirty) {
              setShowUnsavedWarning(true);
            } else {
              setWizardMode(false);
            }
          }}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 font-medium mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </button>

        <div className="mb-5">
          {service.service_number && (
            <span className="text-xs font-mono text-gray-400 mr-2">{service.service_number}</span>
          )}
          <h1 className="text-xl font-bold text-brand-navy inline">
            {service.service_templates?.name ?? "Service"}
          </h1>
        </div>

        <ServiceWizard
          serviceId={service.id}
          service={serviceWithLive}
          persons={livePersons}
          documents={liveDocs}
          requirements={requirements}
          documentTypes={documentTypes}
          templateDocs={templateDocs}
          startStep={wizardStartStep}
          onDirtyChange={setWizardIsDirty}
          onSaveFailedChange={setWizardSaveFailed}
          saveAndCloseRef={wizardSaveAndCloseRef}
          onClose={(updatedDetails, updatedPersons, updatedDocs) => {
            if (updatedDetails) setLiveServiceDetails(updatedDetails);
            if (updatedPersons) setLivePersons(updatedPersons);
            if (updatedDocs) setLiveDocs(updatedDocs);
            setWizardMode(false);
          }}
        />
      </div>
    );
  }

  // ─── Landing page ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* B-047 §4.4 — back-navigation: gray-600 link, smaller chevron. */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 font-medium mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      {/* Header */}
      <div className="mb-5">
        {service.service_number && (
          <span className="text-xs font-mono text-gray-400 mr-2">{service.service_number}</span>
        )}
        <h1 className="text-2xl font-bold text-brand-navy inline">
          {service.service_templates?.name ?? "Service"}
        </h1>
        {service.service_templates?.description && (
          <p className="text-sm text-gray-500 mt-0.5">{service.service_templates.description}</p>
        )}
        <p className="text-sm text-gray-500 mt-1">
          {statusLabel(service.status)}
          {myRole && (
            <> · <span className="capitalize">Your role: {myRole}</span></>
          )}
        </p>
      </div>

      {/* Greeting banner */}
      <div className={`rounded-xl px-5 py-4 mb-5 ${allComplete ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
        <div className="flex items-start gap-3">
          {allComplete
            ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            : <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          }
          <p className={`text-sm font-medium ${allComplete ? "text-green-800" : "text-amber-800"}`}>
            {allComplete
              ? "All sections complete! Your application is ready for review."
              : "Please complete all sections below to submit your application."
            }
          </p>
        </div>
      </div>

      {/* Section checklist */}
      <div className="rounded-xl border bg-white mb-6 overflow-hidden">
        {SECTION_CONFIG.map((section, i) => (
          <SectionRow
            key={section.label}
            label={section.label}
            complete={sectionCompletion[i]}
            onReview={() => openWizard(section.stepIndex)}
          />
        ))}
      </div>

      {/* CTA */}
      <Button
        onClick={() => openWizard(0)}
        className="bg-brand-navy hover:bg-brand-blue"
        size="lg"
      >
        Review and Complete →
      </Button>
    </div>
  );
}
