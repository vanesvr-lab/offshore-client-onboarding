"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { VerificationResult } from "@/types";

interface ExtractedFieldsPanelProps {
  verificationResult: VerificationResult | null;
}

export function ExtractedFieldsPanel({ verificationResult }: ExtractedFieldsPanelProps) {
  const [open, setOpen] = useState(false);

  if (!verificationResult) return null;

  const { extracted_fields, confidence_score, flags } = verificationResult;
  const hasFields = extracted_fields && Object.keys(extracted_fields).length > 0;

  if (!hasFields && !flags?.length) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-blue transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        AI extracted data
        {confidence_score !== undefined && (
          <span className="ml-1 text-gray-400">({Math.round(confidence_score * 100)}% confidence)</span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 rounded-md border bg-gray-50 p-2.5 text-xs space-y-2">
          {hasFields && (
            <table className="w-full">
              <tbody className="divide-y divide-gray-100">
                {Object.entries(extracted_fields).map(([key, value]) => (
                  <tr key={key}>
                    <td className="py-1 pr-3 text-gray-500 font-medium capitalize whitespace-nowrap">
                      {key.replace(/_/g, " ")}
                    </td>
                    <td className="py-1 text-gray-800 break-all">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {flags && flags.length > 0 && (
            <div>
              <p className="text-amber-700 font-medium mb-0.5">Flags</p>
              <ul className="space-y-0.5">
                {flags.map((flag, i) => (
                  <li key={i} className="text-amber-600">• {flag}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
