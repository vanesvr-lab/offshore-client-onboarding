"use client";

/**
 * B-047 — Async button with the §1.5 loading + success affordance pattern.
 *
 *  - Disables on click while async work runs.
 *  - Swaps label to "loadingLabel" + spinner.
 *  - Holds disabled state ≥200ms even on instant responses (anti-flash).
 *  - Optional success flash: green check + custom label for `successFlashMs` ms,
 *    then snaps back to the idle label.
 *
 * Use this anywhere a primary action fires an async request — Save, Submit,
 * Confirm, Send invite, etc. Pair with the three-tier button system in §4.1.
 *
 * Note: Uses the project's standard `<Button>` primitive (base-ui). Pass any
 * Button props through (variant, size, className, etc.).
 */

import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface AsyncButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  /** Idle label — what shows before / after async runs. */
  children: ReactNode;
  /** Label while running. Default: "Saving…" */
  loadingLabel?: ReactNode;
  /** Label flashed on success. Default: "Saved" */
  successLabel?: ReactNode;
  /** When true, show success flash on resolve (default: true). */
  showSuccessFlash?: boolean;
  /** How long to hold the success flash before reverting. Default: 600ms */
  successFlashMs?: number;
  /** Minimum time the button stays disabled after click — anti-flash. Default: 200ms */
  minBusyMs?: number;
  /** Async handler. If it throws, button reverts to idle (no success flash). */
  onClick: () => Promise<unknown> | void;
}

type ButtonState = "idle" | "running" | "success";

export function AsyncButton({
  children,
  loadingLabel = "Saving…",
  successLabel = "Saved",
  showSuccessFlash = true,
  successFlashMs = 600,
  minBusyMs = 200,
  onClick,
  disabled,
  className = "",
  ...rest
}: AsyncButtonProps) {
  const [state, setState] = useState<ButtonState>("idle");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleClick = useCallback(async () => {
    if (state !== "idle") return;
    setState("running");
    const startedAt = Date.now();
    try {
      await onClick();
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, minBusyMs - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (!mountedRef.current) return;
      if (showSuccessFlash) {
        setState("success");
        setTimeout(() => {
          if (mountedRef.current) setState("idle");
        }, successFlashMs);
      } else {
        setState("idle");
      }
    } catch {
      // Surface errors via toast/etc upstream — here we just revert.
      if (mountedRef.current) setState("idle");
    }
  }, [state, onClick, minBusyMs, showSuccessFlash, successFlashMs]);

  const isBusy = state !== "idle";

  return (
    <Button
      {...rest}
      disabled={disabled || isBusy}
      aria-busy={state === "running" || undefined}
      className={className}
      onClick={() => void handleClick()}
    >
      {state === "running" && (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      {state === "success" && (
        <Check className="h-4 w-4 text-green-200" aria-hidden="true" />
      )}
      {state === "idle" && children}
      {state === "running" && loadingLabel}
      {state === "success" && successLabel}
    </Button>
  );
}
