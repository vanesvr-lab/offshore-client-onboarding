"use client";

// B-075 — shared "Filled from uploaded document" banner. Used by both
// the client KYC wizard (IdentityStep) and the admin KycLongForm so the
// two presentations carry identical visual language.
//
// Client-side renders only `Re-apply`. Admin renders `[status pill]`,
// `View`, and `Re-apply` — the admin extras are gated behind optional
// props so the client banner stays clean.
//
// B-077 Batch 3 — added `showStatus` + `documentStatus` props so the
// admin per-section render shows a small status pill that mirrors the
// source document's status (verified / flagged / approved / rejected /
// pending). View button switched to `outline` variant for visual parity
// with the per-doc rows above the banner.

import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AiPrefillBannerProps {
  /** Default: "Filled from uploaded document". */
  title?: string;
  /** Default: "Values extracted from your passport / ID." */
  subtitle?: string;
  /** Re-apply: re-pulls extracted values from the source document into the form. */
  onReapply?: () => void;
  /** When true, the Re-apply button shows a spinner and is disabled. */
  isReapplying?: boolean;
  /**
   * Admin-only: opens a right-slide panel with the source doc preview and
   * Approve / Revoke admin-status controls. When omitted, the View button
   * is hidden — keeping the client banner clean.
   */
  onView?: () => void;
  /** Admin-only adornment (e.g. small "Approved" indicator). */
  rightAdornment?: React.ReactNode;
  /** B-077 Batch 3 — admin path opt-in: render a status pill before the View button. */
  showStatus?: boolean;
  /** B-077 Batch 3 — combined AI + admin status of the source doc. */
  documentStatus?: AiPrefillBannerStatus | null;
}

export type AiPrefillBannerStatus =
  | "approved"
  | "rejected"
  | "verified"
  | "flagged"
  | "manual_review"
  | "pending"
  | "not_run"
  | "unknown";

const STATUS_PILL: Record<AiPrefillBannerStatus, { label: string; classes: string }> = {
  approved:      { label: "Approved",      classes: "bg-green-50 text-green-700 border-green-200" },
  rejected:      { label: "Rejected",      classes: "bg-red-50 text-red-700 border-red-200" },
  verified:      { label: "AI verified",   classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  flagged:       { label: "Flagged",       classes: "bg-amber-50 text-amber-700 border-amber-200" },
  manual_review: { label: "Manual review", classes: "bg-amber-50 text-amber-700 border-amber-200" },
  pending:       { label: "Pending",       classes: "bg-gray-50 text-gray-600 border-gray-200" },
  not_run:       { label: "Not run",       classes: "bg-gray-50 text-gray-500 border-gray-200" },
  unknown:       { label: "Unknown",       classes: "bg-gray-50 text-gray-500 border-gray-200" },
};

export function AiPrefillBanner({
  title = "Filled from uploaded document",
  subtitle = "Values extracted from your passport / ID.",
  onReapply,
  isReapplying = false,
  onView,
  rightAdornment,
  showStatus = false,
  documentStatus = null,
}: AiPrefillBannerProps) {
  const statusKey: AiPrefillBannerStatus | null =
    showStatus && documentStatus ? documentStatus : null;
  const pill = statusKey ? STATUS_PILL[statusKey] : null;
  return (
    <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 flex items-start gap-3">
      <Sparkles className="h-4 w-4 text-brand-blue shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-navy">{title}</p>
        <p className="text-xs text-gray-600">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {rightAdornment}
        {pill && (
          <span
            className={`inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded border ${pill.classes}`}
          >
            {pill.label}
          </span>
        )}
        {onView && (
          <Button
            variant="outline"
            size="sm"
            onClick={onView}
            className="h-7 text-xs"
          >
            View
          </Button>
        )}
        {onReapply && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReapply}
            disabled={isReapplying}
            className="h-7 text-xs"
          >
            {isReapplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Re-apply
          </Button>
        )}
      </div>
    </div>
  );
}
