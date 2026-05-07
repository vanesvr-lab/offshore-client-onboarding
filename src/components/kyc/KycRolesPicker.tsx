"use client";

// B-076 — shared "Roles: [✓ Director] [☐ Shareholder] [✓ UBO]" picker.
// Lifted from `PerPersonReviewWizard.RoleToggleRow` so admin's
// per-profile view can use the same UI. The component is purely
// presentational: the caller owns the API mutation via `onToggleRole`.

import { useState } from "react";
import { CheckSquare, Square, Loader2 } from "lucide-react";

export interface KycRolesPickerOption {
  key: string;
  label: string;
  /** Optional Tailwind class set applied when this role is active. */
  activeClass?: string;
  /** Optional hover class merged with `activeClass`. */
  activeHoverClass?: string;
}

export interface KycRolesPickerProps {
  /** Currently-active role keys. */
  selectedRoles: string[];
  /** All toggleable roles (button rendered per entry). */
  availableRoles: KycRolesPickerOption[];
  /** Server toggle. Caller handles API + optimistic state; component
   *  shows a spinner while the promise is pending. */
  onToggleRole: (roleKey: string) => Promise<void>;
  /** Hide the leading "Roles:" label. */
  hideLabel?: boolean;
  /** Disable every button (e.g. permission gate). */
  disabled?: boolean;
}

const INACTIVE_TONE =
  "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";

export function KycRolesPicker({
  selectedRoles,
  availableRoles,
  onToggleRole,
  hideLabel = false,
  disabled = false,
}: KycRolesPickerProps) {
  const [pending, setPending] = useState<Set<string>>(new Set());

  const selected = new Set(selectedRoles);

  async function handleClick(roleKey: string) {
    if (disabled || pending.has(roleKey)) return;
    setPending((prev) => new Set(prev).add(roleKey));
    try {
      await onToggleRole(roleKey);
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(roleKey);
        return next;
      });
    }
  }

  return (
    <div className="inline-flex items-center gap-3 flex-wrap">
      {!hideLabel && (
        <span className="text-sm font-medium text-gray-600 select-none">
          Roles:
        </span>
      )}
      <div className="inline-flex items-center gap-2 flex-wrap">
        {availableRoles.map((opt) => {
          const active = selected.has(opt.key);
          const busy = pending.has(opt.key);
          const tone = active
            ? `${opt.activeClass ?? "bg-blue-50 text-blue-700 border-blue-200"} ${opt.activeHoverClass ?? "hover:bg-blue-100"}`
            : INACTIVE_TONE;
          return (
            <button
              key={opt.key}
              type="button"
              role="checkbox"
              aria-checked={active}
              aria-label={`Toggle ${opt.label} role`}
              onClick={() => void handleClick(opt.key)}
              disabled={disabled || busy}
              className={`inline-flex items-center gap-2 h-10 px-3 py-2 text-sm font-medium rounded-md border cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${tone}`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : active ? (
                <CheckSquare className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Square className="h-4 w-4 text-gray-400" aria-hidden="true" />
              )}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
