"use client";

// B-075 — shared "Filled from uploaded document" banner. Used by both
// the client KYC wizard (IdentityStep) and the admin KycLongForm so the
// two presentations carry identical visual language.
//
// Client-side renders only `Re-apply`. Admin renders `View` + `Re-apply`
// (the View button opens a right-slide doc preview + Approve / Revoke
// panel — wired in Batch 4).

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
}

export function AiPrefillBanner({
  title = "Filled from uploaded document",
  subtitle = "Values extracted from your passport / ID.",
  onReapply,
  isReapplying = false,
  onView,
  rightAdornment,
}: AiPrefillBannerProps) {
  return (
    <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 flex items-start gap-3">
      <Sparkles className="h-4 w-4 text-brand-blue shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-navy">{title}</p>
        <p className="text-xs text-gray-600">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {rightAdornment}
        {onView && (
          <Button
            variant="ghost"
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
