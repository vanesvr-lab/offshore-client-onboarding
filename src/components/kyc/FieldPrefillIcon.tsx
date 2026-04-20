"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PrefillableField } from "@/lib/kyc/computePrefillable";

interface Props {
  /** The extracted value + source doc metadata for this form field. */
  prefillFrom: PrefillableField;
  /** Human label, used inside aria-label + success toast copy. */
  fieldLabel: string;
  /** Called when user clicks the icon. Return a Promise so the caller can
   *  gate the success/error toast. The icon spins while the promise is pending. */
  onFill: (target: string, value: string, sourceDocLabel: string, fieldLabel: string) => Promise<void>;
}

function truncate(value: string, max = 60): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

/**
 * B-044 — inline ✨ icon next to a KYC form field label.
 * Visible whenever the AI has extracted a value for this target, regardless
 * of whether the form field is already filled. Clicking replaces the current
 * form value with the extracted one.
 */
export function FieldPrefillIcon({ prefillFrom, fieldLabel, onFill }: Props) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await onFill(prefillFrom.target, prefillFrom.value, prefillFrom.sourceDocLabel, fieldLabel);
    } finally {
      setPending(false);
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => void handleClick()}
              disabled={pending}
              aria-label={`Fill ${fieldLabel} from uploaded document`}
              className="inline-flex align-middle items-center justify-center ml-1 h-4 w-4 rounded hover:bg-brand-blue/10 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 disabled:opacity-60"
            />
          }
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin text-brand-blue" />
          ) : (
            <Sparkles className="h-3 w-3 text-brand-blue" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          <p>Extracted: &ldquo;{truncate(prefillFrom.value)}&rdquo;</p>
          <p className="text-gray-300">From: {prefillFrom.sourceDocLabel} — click to use</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FieldPrefillIcon;
