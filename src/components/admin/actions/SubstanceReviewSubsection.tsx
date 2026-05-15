"use client";

// B-119 — Substance Review subsection wrapper. The body is the existing
// SubstanceReviewForm; the wrapper adds the chevron + label + status
// pill in the subsection-accordion shell. The form's internal section
// header (`ConnectedSectionHeader`) is suppressed via the new
// `hideHeader` prop so the subsection has only one status surface.

import { ShieldCheck } from "lucide-react";
import { ActionSubsection } from "./ActionSubsection";
import { SubstanceReviewForm } from "../SubstanceReviewForm";
import {
  ReferenceFormsPanel,
  type ReferenceFormSummary,
  type SubmittedFormSummary,
} from "./ReferenceFormsPanel";
import type { ServiceAction, ServiceSubstance } from "@/types";

interface Props {
  serviceId: string;
  serviceLabel: string;
  action: ServiceAction;
  initialSubstance: ServiceSubstance | null;
  onSaved?: (action: ServiceAction) => void;
  defaultOpen?: boolean;
  referenceForms?: ReferenceFormSummary[];
  submittedFormsByRefId?: Record<string, SubmittedFormSummary[]>;
}

export function SubstanceReviewSubsection({
  serviceId,
  serviceLabel,
  action,
  initialSubstance,
  onSaved,
  defaultOpen,
  referenceForms = [],
  submittedFormsByRefId = {},
}: Props) {
  return (
    <ActionSubsection
      serviceId={serviceId}
      action={action}
      title="Substance Review"
      icon={<ShieldCheck className="h-3.5 w-3.5" />}
      onSaved={onSaved}
      defaultOpen={defaultOpen}
    >
      <SubstanceReviewForm
        serviceId={serviceId}
        serviceLabel={serviceLabel}
        initialSubstance={initialSubstance}
      />
      <ReferenceFormsPanel
        serviceId={serviceId}
        actionKey="substance_review"
        referenceForms={referenceForms}
        submittedFormsByRefId={submittedFormsByRefId}
      />
    </ActionSubsection>
  );
}
