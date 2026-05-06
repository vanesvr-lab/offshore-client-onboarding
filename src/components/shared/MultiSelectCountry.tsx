"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown } from "lucide-react";

export const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola",
  "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados",
  "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei",
  "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile",
  "China", "Colombia", "Comoros", "Congo (Democratic Republic)", "Congo (Republic)",
  "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia",
  "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana",
  "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland",
  "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Jamaica", "Japan", "Jordan",
  "Kazakhstan", "Kenya", "Kiribati", "Korea (North)", "Korea (South)",
  "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia",
  "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein",
  "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia",
  "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania",
  "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco",
  "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand",
  "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway",
  "Oman", "Pakistan", "Palau", "Palestine", "Panama",
  "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland",
  "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
  "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
  "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia",
  "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore",
  "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa",
  "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname",
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan",
  "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States",
  "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela",
  "Vietnam", "Yemen", "Zambia", "Zimbabwe",
  // British Overseas Territories and major financial centres
  "Bermuda", "British Virgin Islands", "Cayman Islands", "Channel Islands",
  "Gibraltar", "Guernsey", "Hong Kong", "Isle of Man", "Jersey",
  "Macau", "Turks and Caicos Islands",
];

interface MultiSelectCountryProps {
  value: string[];
  onChange: (countries: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MultiSelectCountry({
  value,
  onChange,
  placeholder = "Search countries…",
  disabled = false,
}: MultiSelectCountryProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const updateDropdownPosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open) updateDropdownPosition();
  }, [open, updateDropdownPosition]);

  const filtered = COUNTRIES.filter(
    (c) =>
      !value.includes(c) &&
      c.toLowerCase().includes(search.toLowerCase())
  );

  function addCountry(country: string) {
    onChange([...value, country]);
    setSearch("");
    // Keep dropdown open to allow adding more countries
  }

  function removeCountry(country: string) {
    onChange(value.filter((c) => c !== country));
  }

  if (disabled) {
    return value.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {value.map((country) => (
          <span
            key={country}
            className="inline-flex items-center bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full"
          >
            {country}
          </span>
        ))}
      </div>
    ) : (
      <p className="text-sm text-gray-400">—</p>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((country) => (
            <span
              key={country}
              className="inline-flex items-center gap-1 bg-brand-navy/10 text-brand-navy text-xs px-2 py-1 rounded-full"
            >
              {country}
              <button
                type="button"
                onClick={() => removeCountry(country)}
                className="text-gray-600 hover:text-red-600 ml-0.5"
                aria-label={`Remove ${country}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input — click anywhere to toggle dropdown */}
      <div
        className="relative cursor-pointer max-w-md"
        onClick={() => { if (!open) setOpen(true); }}
      >
        <input
          ref={inputRef}
          type="text"
          className="w-full border border-gray-300 rounded-md px-3 py-2 pr-8 text-sm text-gray-900 placeholder:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-navy/20 focus:border-brand-navy cursor-pointer"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="absolute right-2 top-2 p-0.5 text-gray-600 hover:text-gray-800"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); setSearch(""); }}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Dropdown rendered via portal to escape overflow:hidden parents */}
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
          }}
        >
          {filtered.length > 0 ? (
            filtered.map((country) => (
              <button
                key={country}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-brand-navy/5 hover:text-brand-navy transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addCountry(country);
                }}
              >
                {country}
              </button>
            ))
          ) : (
            <div className="px-3 py-3 text-sm text-gray-500 text-center">
              No matching countries
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
