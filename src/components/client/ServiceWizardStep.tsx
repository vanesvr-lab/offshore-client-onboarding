"use client";

import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

interface Props {
  fields: ServiceField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  readOnly?: boolean;
}

/** Generic step wrapper for service field steps (Company Setup, Financial, Banking). */
export function ServiceWizardStep({ fields, values, onChange, readOnly = false }: Props) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">
        No fields required for this section.
      </p>
    );
  }

  return (
    <DynamicServiceForm
      fields={fields}
      values={values}
      onChange={onChange}
      readOnly={readOnly}
    />
  );
}
