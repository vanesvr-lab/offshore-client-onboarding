"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { COUNTRIES } from "./MultiSelectCountry";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onBlur?: () => void;
}

/**
 * Searchable country dropdown with "Other" fallback for custom entries.
 * Uses the shared COUNTRIES list (195+ countries).
 */
export function CountrySelect({ value, onChange, placeholder = "Select country...", className = "", onBlur }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Detect if current value is a custom entry (not in list)
  const isCustom = value && !COUNTRIES.includes(value) && value !== "";

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

  const filtered = search
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : COUNTRIES;

  function select(country: string) {
    onChange(country);
    setOpen(false);
    setSearch("");
    setCustomMode(false);
  }

  if (customMode || isCustom) {
    return (
      <div className={`relative ${className}`}>
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="Enter country name"
          className="text-sm pr-8"
        />
        <button
          type="button"
          onClick={() => { setCustomMode(false); onChange(""); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600"
          title="Use dropdown instead"
        >
          ↺
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left border rounded-md px-3 py-2 text-sm bg-white hover:border-gray-400 flex items-center justify-between"
      >
        <span className={value ? "text-gray-900" : "text-gray-500"}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-gray-600 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-md shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
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
                  key={c}
                  type="button"
                  onClick={() => select(c)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between ${value === c ? "bg-blue-50 text-brand-navy" : "text-gray-700"}`}
                >
                  {c}
                  {value === c && <Check className="h-3.5 w-3.5 text-brand-blue" />}
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => { setCustomMode(true); setOpen(false); onChange(""); }}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 border-t"
            >
              Other (enter manually)...
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
