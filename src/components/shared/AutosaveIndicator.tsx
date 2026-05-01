"use client";

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { SaveState } from "@/lib/hooks/useAutosave";

interface Props {
  state: SaveState;
  /** Called when the user clicks the indicator while in `failed` state. */
  onRetry?: () => void;
  /** Optional extra className for layout (e.g. "ml-auto"). */
  className?: string;
}

export function AutosaveIndicator({ state, onRetry, className = "" }: Props) {
  if (state === "idle") return null;

  if (state === "saving") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-gray-500 ${className}`}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }

  if (state === "saved") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-green-700 ${className}`}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Saved
      </span>
    );
  }

  if (state === "retrying") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-amber-700 ${className}`}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Couldn&apos;t save — retrying…
      </span>
    );
  }

  // failed
  return (
    <button
      type="button"
      onClick={onRetry}
      className={`inline-flex items-center gap-1.5 text-xs text-red-700 hover:text-red-800 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 rounded ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Couldn&apos;t save — retry
    </button>
  );
}
