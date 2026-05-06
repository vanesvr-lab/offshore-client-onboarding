"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

interface NumberInputProps {
  value: string | number | null | undefined;
  onChange: (raw: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

/**
 * Currency / amount input that shows thousand separators on blur and raw
 * digits on focus. Stored value is always the raw numeric string (no
 * commas) so the API/DB never receives a formatted string.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  readOnly,
  className,
  id,
  ariaLabel,
}: NumberInputProps) {
  const [focused, setFocused] = useState(false);

  const raw =
    value === null || value === undefined || value === "" ? "" : String(value);

  function format(str: string): string {
    if (str === "") return "";
    // Allow negative + decimals; only format the integer part.
    const negative = str.startsWith("-");
    const body = negative ? str.slice(1) : str;
    const [intPart, decPart] = body.split(".");
    const num = Number(intPart);
    if (!Number.isFinite(num)) return str;
    const formattedInt = num.toLocaleString("en-US");
    const sign = negative ? "-" : "";
    return decPart != null ? `${sign}${formattedInt}.${decPart}` : `${sign}${formattedInt}`;
  }

  const displayValue = focused ? raw : format(raw);

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-label={ariaLabel}
      className={className}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        // Strip everything except digits, dot, and a leading minus.
        let v = e.target.value.replace(/[^\d.\-]/g, "");
        // Only allow leading '-' (drop any subsequent ones).
        v = v.replace(/(?!^)-/g, "");
        // Only allow first '.'.
        const firstDot = v.indexOf(".");
        if (firstDot !== -1) {
          v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
        }
        onChange(v);
      }}
    />
  );
}
