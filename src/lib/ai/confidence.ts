/**
 * Normalize an AI confidence score to a clamped integer 0-100.
 *
 * The prompt in `verifyDocument.ts` instructs the AI to return
 * `confidence_score` in the 0-100 range. Several call sites in older code
 * mistakenly multiplied by 100 again, producing values like 3000% or 5500%
 * (B-050 §2.1). This helper is the single source of truth: it clamps to
 * 0-100 and rounds to an integer for display.
 *
 * If the AI ever returns a fractional value in 0-1 (drift from the schema),
 * scale it up so the display still makes sense. Anything > 100 is clamped.
 */
export function normalizeConfidence(raw: number | null | undefined): number {
  if (raw == null || Number.isNaN(raw)) return 0;
  const scaled = raw > 0 && raw <= 1 ? raw * 100 : raw;
  if (scaled < 0) return 0;
  if (scaled > 100) return 100;
  return Math.round(scaled);
}

/** Format a normalized confidence as a `42%` string. */
export function formatConfidence(raw: number | null | undefined): string {
  return `${normalizeConfidence(raw)}%`;
}
