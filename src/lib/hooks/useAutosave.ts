"use client";

import { useCallback, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "failed" | "retrying";

interface UseAutosaveOptions {
  /** Backoff delays in ms. Defaults to [1000, 3000, 9000] = 3 retries. */
  backoff?: number[];
  /** Time to keep the "saved" state visible before fading back to idle. */
  savedFadeMs?: number;
}

interface UseAutosaveReturn {
  state: SaveState;
  /**
   * Run a save attempt. Returns true if the underlying handler succeeds on
   * the initial try OR any retry, false if all attempts fail. While the
   * function is awaiting retries, `state` will be `"retrying"`.
   */
  save: (handler: () => Promise<boolean>) => Promise<boolean>;
  /** Manually trigger another retry while in `failed` state. */
  retry: () => Promise<boolean> | undefined;
  /** Reset to idle without a save attempt. */
  reset: () => void;
}

/**
 * State machine + retry-with-backoff wrapper around a save handler.
 *
 * B-050 §4.1. Every wizard save handler should route through this so that:
 *   - the user sees a visible state (saving / saved / failed / retrying)
 *   - transient failures are retried with exponential backoff
 *   - terminal failures stop the user from leaving the wizard via the
 *     unsaved-changes dialog (consumer responsibility — read `state`)
 */
export function useAutosave(options: UseAutosaveOptions = {}): UseAutosaveReturn {
  const { backoff = [1000, 3000, 9000], savedFadeMs = 2000 } = options;
  const [state, setState] = useState<SaveState>("idle");
  const lastHandlerRef = useRef<(() => Promise<boolean>) | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearFade() {
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }

  const save = useCallback(
    async (handler: () => Promise<boolean>): Promise<boolean> => {
      lastHandlerRef.current = handler;
      clearFade();
      setState("saving");
      try {
        const ok = await handler();
        if (ok) {
          setState("saved");
          fadeTimerRef.current = setTimeout(() => {
            setState((cur) => (cur === "saved" ? "idle" : cur));
            fadeTimerRef.current = null;
          }, savedFadeMs);
          return true;
        }
      } catch {
        // fall through to retry path
      }
      // Retry-with-backoff
      for (const delay of backoff) {
        setState("retrying");
        await new Promise((r) => setTimeout(r, delay));
        try {
          const ok = await handler();
          if (ok) {
            setState("saved");
            fadeTimerRef.current = setTimeout(() => {
              setState((cur) => (cur === "saved" ? "idle" : cur));
              fadeTimerRef.current = null;
            }, savedFadeMs);
            return true;
          }
        } catch {
          // continue to next retry
        }
      }
      setState("failed");
      return false;
    },
    [backoff, savedFadeMs]
  );

  const retry = useCallback(() => {
    if (!lastHandlerRef.current) return undefined;
    return save(lastHandlerRef.current);
  }, [save]);

  const reset = useCallback(() => {
    clearFade();
    setState("idle");
  }, []);

  return { state, save, retry, reset };
}
