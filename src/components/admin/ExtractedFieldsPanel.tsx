"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import type { VerificationResult } from "@/types";

interface ExtractedFieldsPanelProps {
  verificationResult: VerificationResult | null;
}

export function ExtractedFieldsPanel({ verificationResult }: ExtractedFieldsPanelProps) {
  const [open, setOpen] = useState(false);

  if (!verificationResult) return null;

  const { extracted_fields, confidence_score, flags, rule_results } = verificationResult;
  const hasFields = extracted_fields && Object.keys(extracted_fields).length > 0;
  const hasRules = rule_results && rule_results.length > 0;

  if (!hasFields && !flags?.length && !hasRules) return null;

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

          {hasRules && (
            <div>
              <p className="text-gray-600 font-medium mb-1.5">Rule Results</p>
              <div className="space-y-2">
                {rule_results!.map((rr) => (
                  <div key={rr.rule_number} className="flex gap-2">
                    <div className="shrink-0 mt-0.5">
                      {rr.passed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-medium ${rr.passed ? "text-gray-700" : "text-red-700"}`}>
                        {rr.rule_number}. {rr.rule_text}
                      </p>
                      <p className="text-gray-500 mt-0.5">{rr.explanation}</p>
                      {rr.evidence && (
                        <p className="italic text-gray-400 mt-0.5">{rr.evidence}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
