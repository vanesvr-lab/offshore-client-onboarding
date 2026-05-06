"use client";

import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { SubstanceReviewForm } from "./SubstanceReviewForm";
import { BankAccountOpeningStub } from "./BankAccountOpeningStub";
import { FscChecklistStub } from "./FscChecklistStub";
import type {
  ActionKey,
  ServiceAction,
  ServiceTemplateAction,
  ServiceSubstance,
} from "@/types";

// B-072 Batch 6 — composes the per-service admin action surface in
// `service_template_actions.sort_order`. Renders nothing for templates
// without action bindings (e.g. Trust, Domestic Co), so the section stays
// invisible on those pages.

interface Props {
  serviceId: string;
  serviceLabel: string;
  templateActions: ServiceTemplateAction[];
  actionsByKey: Record<string, ServiceAction>;
  initialSubstance: ServiceSubstance | null;
  anchorId?: string;
}

export function AdminServiceActionsSection({
  serviceId,
  serviceLabel,
  templateActions,
  actionsByKey,
  initialSubstance,
  anchorId,
}: Props) {
  // Local state so child PATCHes can update the instance without a full
  // page refresh — keeps the FSC stub's status pill in sync after Save.
  const [actions, setActions] = useState<Record<string, ServiceAction>>(actionsByKey);

  if (templateActions.length === 0) return null;

  function handleSaved(updated: ServiceAction) {
    setActions((prev) => ({ ...prev, [updated.action_key]: updated }));
  }

  return (
    <section
      id={anchorId}
      className="space-y-3 scroll-mt-24"
      aria-label="Admin actions"
    >
      <header className="flex items-center gap-2">
        <ClipboardList className="size-4 text-gray-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Admin Actions
        </h2>
      </header>

      <div className="space-y-3">
        {templateActions.map((ta) => {
          const instance = actions[ta.action_key];
          if (!instance) return null;
          switch (ta.action_key as ActionKey) {
            case "substance_review":
              return (
                <SubstanceReviewForm
                  key={ta.id}
                  serviceId={serviceId}
                  serviceLabel={serviceLabel}
                  initialSubstance={initialSubstance}
                />
              );
            case "bank_account_opening":
              return (
                <BankAccountOpeningStub
                  key={ta.id}
                  serviceId={serviceId}
                  initialAction={instance}
                  onSaved={handleSaved}
                />
              );
            case "fsc_checklist":
              return (
                <FscChecklistStub
                  key={ta.id}
                  serviceId={serviceId}
                  initialAction={instance}
                  onSaved={handleSaved}
                />
              );
            default:
              // Unknown action key — render a minimal placeholder so admin
              // notices that a template was bound to a key we haven't built.
              return (
                <div
                  key={ta.id}
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700"
                >
                  Unknown admin action: <code>{ta.action_key}</code>. Add a
                  renderer in <code>AdminServiceActionsSection.tsx</code>.
                </div>
              );
          }
        })}
      </div>
    </section>
  );
}
