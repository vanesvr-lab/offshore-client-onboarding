"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";

/**
 * Click-to-open / hover-to-open ELI10 tooltip for the People & KYC step
 * intro. Keyboard-accessible: focus + Enter/Space toggles, Esc closes.
 */
export function KycIntroTooltip() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        aria-label="Why we collect KYC information"
        aria-expanded={open}
        className="text-gray-400 hover:text-brand-blue transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/40 rounded-full"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Why we collect KYC information"
          className="absolute z-50 top-full left-0 sm:left-1/2 sm:-translate-x-1/2 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-white shadow-xl border rounded-xl p-4 text-sm text-gray-700 space-y-3"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div>
            <p className="font-semibold text-brand-navy mb-1">Why we ask for this</p>
            <p className="text-xs leading-relaxed">
              Mauritius regulators require us to verify everyone with significant control or
              ownership of your company. This is called Know Your Customer (KYC) and it&apos;s the
              law for licensed management companies.
            </p>
          </div>

          <div>
            <p className="font-semibold text-brand-navy mb-1">Who you need to add</p>
            <ul className="text-xs leading-relaxed space-y-1 list-none">
              <li>
                <span className="font-medium">Directors</span> — anyone listed on the board
              </li>
              <li>
                <span className="font-medium">Shareholders</span> — anyone holding shares
                (including indirect ownership)
              </li>
              <li>
                <span className="font-medium">UBOs (Ultimate Beneficial Owners)</span> — any
                individual who ultimately owns or controls 25% or more of the company
              </li>
            </ul>
            <p className="text-xs leading-relaxed mt-1">
              The same person can have more than one role — just tick all that apply.
            </p>
          </div>

          <div>
            <p className="font-semibold text-brand-navy mb-1">What they&apos;ll need</p>
            <p className="text-xs leading-relaxed">
              Each person will be asked for personal details, identification, proof of address,
              source of wealth, and a few declarations. We&apos;ll guide them step by step. You
              can either fill it in for them or invite them to fill it in themselves.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
