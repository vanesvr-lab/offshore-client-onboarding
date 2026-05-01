/**
 * B-047 — Field-width system for client-facing forms.
 *
 * Replace "every input is full width" with content-aware widths so forms
 * read as a coherent layout instead of a wall of identical boxes. Use the
 * Tailwind class strings below (or the px constants) on individual inputs;
 * for two-column rows compose with the grid pattern in the README at the
 * bottom of this file.
 *
 * Mobile-first: all widths collapse to full-width on mobile via the input
 * containers' grid/flex parents — these classes only take effect at the
 * `md:` breakpoint when the parent is a row.
 */

export const formWidths = {
  /** ZIP / postal codes: ≤8 chars */
  postal: "md:w-24",
  /** Phone numbers */
  phone: "md:w-48",
  /** Single date picker */
  date: "md:w-40",
  /** Country dropdown */
  country: "md:w-60",
  /** State / region picker */
  state: "md:w-52",
  /** City */
  city: "md:w-64",
  /** Currency amount */
  currency: "md:w-32",
  /** Tax ID, passport number, NI number */
  identifier: "md:w-56",
  /** Email address */
  email: "md:w-80",
  /** Full name (first + last) */
  fullName: "md:w-80",
  /** Address line 1, descriptive text — full width */
  full: "w-full",
  /** Long-form text area minimum height */
  longFormTextareaMin: "min-h-[120px]",
} as const;

export type FormWidthKey = keyof typeof formWidths;

/**
 * Tailwind classnames for a two-column row where the second field is narrow
 * (e.g. email + phone, address + postal). Mobile collapses to one column.
 */
export const twoColRowClass = "grid grid-cols-1 md:grid-cols-[1fr_192px] gap-4";

/**
 * Equal-weight two-column row (e.g. first / last name).
 */
export const evenTwoColRowClass = "grid grid-cols-1 md:grid-cols-2 gap-4";

/**
 * Vertical rhythm helpers — pair with the spacing scale in §1.3.
 *   Heading → first input: 16px (`mt-4`)
 *   Input → input (same group): 16px (`gap-4`)
 *   Group → group (same section): 24px (`space-y-6`)
 *   Section → section: 48px (`space-y-12`)
 */
export const sectionSpacing = "space-y-12";
export const groupSpacing = "space-y-6";
export const fieldSpacing = "space-y-4";
