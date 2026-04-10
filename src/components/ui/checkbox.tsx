"use client";

import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function Checkbox({ checked = false, onCheckedChange, disabled, className, id }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={cn(
        "h-4 w-4 rounded border-gray-300 text-brand-navy accent-brand-navy cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    />
  );
}

export { Checkbox };
