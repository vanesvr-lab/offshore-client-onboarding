"use client";

import { useState, useCallback } from "react";

export type FieldState = "normal" | "error" | "filled";

export function useFieldValidation() {
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const markTouched = useCallback((fieldKey: string) => {
    setTouched((prev) => new Set(prev).add(fieldKey));
  }, []);

  const markAllTouched = useCallback((fieldKeys: string[]) => {
    setTouched((prev) => {
      const next = new Set(prev);
      fieldKeys.forEach((k) => next.add(k));
      return next;
    });
  }, []);

  function getFieldState(fieldKey: string, value: unknown, required?: boolean): FieldState {
    const isFilled = value !== null && value !== undefined && String(value).trim() !== "" && value !== false;

    if (isFilled) return "filled";
    if (required && touched.has(fieldKey)) return "error";
    return "normal";
  }

  return { markTouched, markAllTouched, getFieldState };
}
