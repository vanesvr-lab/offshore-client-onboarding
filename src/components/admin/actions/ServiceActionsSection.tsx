"use client";

// B-119 — Top-level Actions section. Replaces the legacy inline
// `AdminServiceActionsSection`. Composes the four named subsections in
// the order dictated by `service_template_actions.sort_order`. Renders
// only when the current template has ≥1 binding — the parent guards on
// that already, but we re-check here so an empty `templateActions`
// array doesn't render an empty section body.
//
// Section header (chevron + label + completion %) is supplied by the
// caller via `<ServiceCollapsibleSection variant="step" />`. This
// component is the body content.

import { useState } from "react";
import type {
  ActionKey,
  ServiceAction,
  ServiceTemplateAction,
  ServiceSubstance,
} from "@/types";
import { SubstanceReviewSubsection } from "./SubstanceReviewSubsection";
import { BankAccountOpeningSubsection } from "./BankAccountOpeningSubsection";
import { CompanyRegistrationSubsection } from "./CompanyRegistrationSubsection";
import { FscChecklistSubsection } from "./FscChecklistSubsection";
import type {
  ReferenceFormSummary,
  SubmittedFormSummary,
} from "./ReferenceFormsPanel";

interface Props {
  serviceId: string;
  serviceLabel: string;
  templateActions: ServiceTemplateAction[];
  actionsByKey: Record<string, ServiceAction>;
  initialSubstance: ServiceSubstance | null;
  /** B-119 — fired when any subsection saves so the parent's
   *  per-action lookup, Pending card, and Progress meters all stay
   *  current without a router refresh. */
  onActionSaved?: (action: ServiceAction) => void;
  /** B-120 — active reference forms keyed by action_key. Pulled from
   *  the loader so each subsection can render its inline panel without
   *  per-row server calls. */
  referenceFormsByAction?: Record<string, ReferenceFormSummary[]>;
  /** B-120 — submitted form uploads keyed by reference_form_id. The
   *  panel slices its own list by joining on form.id. */
  submittedFormsByRefId?: Record<string, SubmittedFormSummary[]>;
}

export function ServiceActionsSection({
  serviceId,
  serviceLabel,
  templateActions,
  actionsByKey,
  initialSubstance,
  onActionSaved,
  referenceFormsByAction,
  submittedFormsByRefId,
}: Props) {
  const [actions, setActions] = useState<Record<string, ServiceAction>>(
    actionsByKey,
  );

  function handleSaved(next: ServiceAction) {
    setActions((prev) => ({ ...prev, [next.action_key]: next }));
    onActionSaved?.(next);
  }

  if (templateActions.length === 0) return null;

  return (
    <div className="space-y-3">
      {templateActions.map((ta) => {
        const instance = actions[ta.action_key];
        if (!instance) return null;
        const refForms = referenceFormsByAction?.[ta.action_key] ?? [];
        // Slice submittedFormsByRefId to only the forms this subsection owns
        // so the panel doesn't accidentally render a sibling subsection's
        // submitted-form history if the keys overlapped (they don't today,
        // but the FK is the single source of truth).
        const submittedSlice: Record<string, SubmittedFormSummary[]> = {};
        for (const f of refForms) {
          if (submittedFormsByRefId?.[f.id]) {
            submittedSlice[f.id] = submittedFormsByRefId[f.id];
          }
        }
        switch (ta.action_key as ActionKey) {
          case "substance_review":
            return (
              <SubstanceReviewSubsection
                key={ta.id}
                serviceId={serviceId}
                serviceLabel={serviceLabel}
                action={instance}
                initialSubstance={initialSubstance}
                referenceForms={refForms}
                submittedFormsByRefId={submittedSlice}
                onSaved={handleSaved}
              />
            );
          case "bank_account_opening":
            return (
              <BankAccountOpeningSubsection
                key={ta.id}
                serviceId={serviceId}
                action={instance}
                referenceForms={refForms}
                submittedFormsByRefId={submittedSlice}
                onSaved={handleSaved}
              />
            );
          case "company_registration":
            return (
              <CompanyRegistrationSubsection
                key={ta.id}
                serviceId={serviceId}
                action={instance}
                referenceForms={refForms}
                submittedFormsByRefId={submittedSlice}
                onSaved={handleSaved}
              />
            );
          case "fsc_checklist":
            return (
              <FscChecklistSubsection
                key={ta.id}
                serviceId={serviceId}
                action={instance}
                referenceForms={refForms}
                submittedFormsByRefId={submittedSlice}
                onSaved={handleSaved}
              />
            );
          default:
            return (
              <div
                key={ta.id}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
              >
                Unknown admin action: <code>{ta.action_key}</code>. Add a
                renderer in <code>ServiceActionsSection.tsx</code>.
              </div>
            );
        }
      })}
    </div>
  );
}
