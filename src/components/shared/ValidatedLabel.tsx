"use client";

import { CheckCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { FieldState } from "@/hooks/useFieldValidation";

interface ValidatedLabelProps {
  htmlFor?: string;
  label?: string;
  required?: boolean;
  state: FieldState;
  className?: string;
  children?: React.ReactNode;
}

export function ValidatedLabel({ htmlFor, label, required, state, className = "", children }: ValidatedLabelProps) {
  const labelColor =
    state === "error" ? "text-red-600" : state === "filled" ? "text-gray-900" : "text-gray-700";

  return (
    <Label
      htmlFor={htmlFor}
      className={`flex items-center gap-1 ${labelColor} ${className}`}
    >
      <span>{label ?? children}</span>
      {required && (
        <span className="text-red-600" aria-hidden="true">*</span>
      )}
      {state === "filled" && (
        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
      )}
    </Label>
  );
}

interface FieldWrapperProps {
  state: FieldState;
  children: React.ReactNode;
  className?: string;
}

/** Wraps a field: adds red helper text when state === "error" */
export function FieldWrapper({ state, children, className = "" }: FieldWrapperProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {children}
      {state === "error" && (
        <p
          role="alert"
          aria-live="polite"
          className="text-xs text-red-600"
        >
          This field is required.
        </p>
      )}
    </div>
  );
}
