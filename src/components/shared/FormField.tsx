"use client";

/**
 * B-047 — Universal form field wrapper.
 *
 * Pattern (top-aligned label, helper persistent below, error replaces helper):
 *
 *   [Label]*               14px font-medium text-gray-900 mb-1.5; * red-600
 *   [input]                44pt min height (h-11), focus ring 2px brand-navy
 *   [helper or error]      12px mt-1; helper = gray-600, error = red-600 + role="alert"
 *
 * Usage — child render-prop receives `id`, `aria-invalid`, `aria-describedby`,
 * and `onBlur` so it can integrate with any input primitive (Input, Textarea,
 * Select, custom CountrySelect/CountryMultiSelect):
 *
 *   <FormField label="Email" required helperText="Used for sign-in" error={emailError}>
 *     {(props) => (
 *       <Input
 *         type="email"
 *         autoComplete="email"
 *         value={email}
 *         onChange={(e) => setEmail(e.target.value)}
 *         {...props}
 *       />
 *     )}
 *   </FormField>
 */

import { useId, type ReactNode } from "react";

export interface FormFieldChildProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

export interface FormFieldProps {
  label: string;
  /** Optional helper text shown below the input. Replaced by `error` when present. */
  helperText?: string;
  /** Error message — when set, replaces helperText, paints red, sets role="alert". */
  error?: string | null;
  required?: boolean;
  /** Width class from `formWidths` — applied to the field container, mobile collapses to full. */
  widthClass?: string;
  /** Extra classes for the outer field container. */
  className?: string;
  /** Render-prop child receives `id`, `aria-invalid`, `aria-describedby`, `aria-required`. */
  children: (props: FormFieldChildProps) => ReactNode;
}

export function FormField({
  label,
  helperText,
  error,
  required,
  widthClass,
  className = "",
  children,
}: FormFieldProps) {
  const id = useId();
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : helperText ? helperId : undefined;
  const hasError = !!error;

  return (
    <div className={`w-full ${className}`.trim()}>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-900 mb-1.5"
      >
        {label}
        {required && (
          <span className="text-red-600 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>

      <div className={widthClass ?? "w-full"}>
        {children({
          id,
          "aria-invalid": hasError,
          "aria-describedby": describedBy,
          "aria-required": required || undefined,
        })}
      </div>

      {hasError ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="mt-1 text-xs text-red-600"
        >
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="mt-1 text-xs text-gray-600">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
