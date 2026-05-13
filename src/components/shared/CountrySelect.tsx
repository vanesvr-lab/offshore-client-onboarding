"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  COUNTRIES_ISO,
  ISO3_TO_NAME,
  NAME_TO_ISO3,
  isValidIso3,
  toIso3,
} from "@/lib/constants/countries";

interface Props {
  /** ISO3 code (e.g. "MUS"). Legacy free-form names are auto-coerced
   *  via `toIso3()`; if neither matches, the value is rendered with a
   *  "(legacy)" tag until the user picks a real entry. */
  value: string;
  onChange: (iso3: string) => void;
  placeholder?: string;
  className?: string;
  onBlur?: () => void;
}

/**
 * Searchable country dropdown.
 * B-100 — stores ISO 3166-1 alpha-3 codes, displays the country name.
 * `value` and `onChange` both speak ISO3. Free-form legacy values are
 * resolved opportunistically; unresolved values render with a small
 * italic "(legacy)" tag next to the displayed value and are cleared
 * the first time the user picks a real entry.
 *
 * Custom-entry mode now accepts a 3-letter code (auto-uppercased,
 * validated against the canonical list) so admins can deal with
 * countries we somehow missed.
 */
export function CountrySelect({
  value,
  onChange,
  placeholder = "Select country...",
  className = "",
  onBlur,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Resolve the displayed name. Order: (1) ISO3 hit → name from table;
  // (2) legacy free-form name → matched name via NAME_TO_ISO3 mapping
  //     (no write, just display); (3) leave as-is + flag legacy.
  const resolved = useMemo(() => {
    if (!value) return { display: "", isLegacy: false };
    if (isValidIso3(value)) {
      return { display: ISO3_TO_NAME[value], isLegacy: false };
    }
    const iso = toIso3(value);
    if (iso) {
      return { display: ISO3_TO_NAME[iso], isLegacy: false };
    }
    return { display: value, isLegacy: true };
  }, [value]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        if (onBlur) onBlur();
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onBlur]);

  const filtered = useMemo(() => {
    if (!search) return COUNTRIES_ISO;
    const q = search.toLowerCase();
    return COUNTRIES_ISO.filter(
      (c) => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q),
    );
  }, [search]);

  function select(iso3: string) {
    onChange(iso3);
    setOpen(false);
    setSearch("");
    setCustomMode(false);
  }

  function commitCustom() {
    const code = customDraft.trim().toUpperCase();
    if (!code) {
      setCustomError("Enter a 3-letter ISO 3166-1 code.");
      return;
    }
    if (!isValidIso3(code)) {
      const fallback = NAME_TO_ISO3[customDraft.trim().toLowerCase()];
      if (fallback) {
        onChange(fallback);
        setCustomMode(false);
        setCustomDraft("");
        setCustomError(null);
        return;
      }
      setCustomError(`"${customDraft}" isn't a known ISO 3166-1 alpha-3 code.`);
      return;
    }
    onChange(code);
    setCustomMode(false);
    setCustomDraft("");
    setCustomError(null);
  }

  if (customMode) {
    return (
      <div className={`relative ${className}`}>
        <Input
          type="text"
          value={customDraft}
          onChange={(e) => {
            setCustomError(null);
            setCustomDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitCustom();
            }
          }}
          onBlur={() => {
            if (customDraft) commitCustom();
            else setCustomMode(false);
          }}
          placeholder="3-letter ISO code (e.g. MUS)"
          className="text-sm pr-8 uppercase"
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            setCustomDraft("");
            setCustomError(null);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 hover:text-gray-800"
          title="Use dropdown instead"
        >
          ↺
        </button>
        {customError && (
          <p className="mt-1 text-[11px] text-red-600">{customError}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left border border-gray-300 rounded-md px-3 py-2 text-sm bg-white hover:border-gray-400 flex items-center justify-between"
      >
        <span className={resolved.display ? "text-gray-900" : "text-gray-500"}>
          {resolved.display || placeholder}
          {resolved.isLegacy && (
            <span className="ml-1.5 text-[10px] italic text-amber-600">(legacy)</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-600 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country..."
                className="w-full pl-8 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-brand-blue"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">No matches.</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.iso3}
                  type="button"
                  onClick={() => select(c.iso3)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${value === c.iso3 ? "bg-blue-50 text-brand-navy" : "text-gray-700"}`}
                >
                  <span>
                    <span className="font-mono text-[10px] text-gray-400 mr-2 align-middle">
                      {c.iso3}
                    </span>
                    {c.name}
                  </span>
                  {value === c.iso3 && <Check className="h-3.5 w-3.5 text-brand-blue" />}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 border-t"
            >
              Other (enter ISO code)...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
