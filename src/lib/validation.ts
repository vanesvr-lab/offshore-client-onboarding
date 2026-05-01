/**
 * B-047 — Form validation utilities.
 *
 * Each validator returns either { valid: true } or { valid: false, message }.
 * Messages follow §8 `error-clarity`: state cause + how to fix.
 *   ✅ "Enter a valid email like name@example.com"
 *   ❌ "Invalid email"
 */

export type ValidationResult = { valid: true } | { valid: false; message: string };

const OK: ValidationResult = { valid: true };

export function isRequired(value: unknown, label = "This field"): ValidationResult {
  if (value === null || value === undefined) {
    return { valid: false, message: `${label} is required.` };
  }
  if (typeof value === "string" && value.trim() === "") {
    return { valid: false, message: `${label} is required.` };
  }
  return OK;
}

export function isMinLength(value: string, min: number, label = "This field"): ValidationResult {
  if ((value ?? "").trim().length < min) {
    return { valid: false, message: `${label} must be at least ${min} characters.` };
  }
  return OK;
}

export function isMaxLength(value: string, max: number, label = "This field"): ValidationResult {
  if ((value ?? "").length > max) {
    return { valid: false, message: `${label} must be ${max} characters or fewer.` };
  }
  return OK;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isEmail(value: string): ValidationResult {
  if (!value) return OK;
  if (!EMAIL_RE.test(value.trim())) {
    return { valid: false, message: "Enter a valid email like name@example.com." };
  }
  return OK;
}

const PHONE_RE = /^[+()\-\s\d]{6,}$/;
export function isPhone(value: string): ValidationResult {
  if (!value) return OK;
  const digits = value.replace(/\D/g, "");
  if (!PHONE_RE.test(value) || digits.length < 6) {
    return { valid: false, message: "Enter a valid phone number, e.g. +230 555 0000." };
  }
  return OK;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isISODate(value: string): ValidationResult {
  if (!value) return OK;
  if (!ISO_DATE_RE.test(value)) {
    return { valid: false, message: "Enter a date in YYYY-MM-DD format." };
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { valid: false, message: "Enter a real calendar date, e.g. 1990-04-21." };
  }
  return OK;
}

/**
 * Helper for chaining validators. Returns the first failing result,
 * or { valid: true } if all pass. Keeps call sites readable:
 *   const result = runAll([
 *     () => isRequired(value, "Email"),
 *     () => isEmail(value),
 *   ]);
 */
export function runAll(checks: Array<() => ValidationResult>): ValidationResult {
  for (const check of checks) {
    const r = check();
    if (!r.valid) return r;
  }
  return OK;
}
