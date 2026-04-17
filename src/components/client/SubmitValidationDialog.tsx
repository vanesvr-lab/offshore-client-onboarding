"use client";

import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ValidationResult } from "@/app/api/services/[id]/validate/route";

type Phase = "loading" | "valid" | "invalid";

interface Props {
  phase: Phase;
  result: ValidationResult | null;
  onConfirmSubmit: () => void;
  onGoBack: () => void;
}

export function SubmitValidationDialog({ phase, result, onConfirmSubmit, onGoBack }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        {phase === "loading" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="h-10 w-10 text-brand-navy animate-spin" />
            <p className="text-base font-semibold text-brand-navy">Validating your application…</p>
            <p className="text-sm text-gray-500 text-center">
              Checking all required fields, people, KYC, and documents.
            </p>
          </div>
        )}

        {phase === "valid" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h2 className="text-lg font-bold text-green-700">All checks passed!</h2>
            <p className="text-sm text-gray-500 text-center">
              Your application is complete and ready to submit for review.
            </p>
            <div className="flex gap-3 mt-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onGoBack}
              >
                Go Back
              </Button>
              <Button
                className="flex-1 bg-brand-navy hover:bg-brand-blue"
                onClick={onConfirmSubmit}
              >
                Submit Application
              </Button>
            </div>
          </div>
        )}

        {phase === "invalid" && result && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
              <h2 className="text-base font-bold text-gray-800">
                {result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} need attention
              </h2>
            </div>
            <p className="text-sm text-gray-500">
              Please fix the issues below before submitting.
            </p>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {result.issues.map((issue, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-gray-700">{issue.section}: </span>
                    <span className="text-gray-600">{issue.message}</span>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              className="w-full bg-brand-navy hover:bg-brand-blue"
              onClick={onGoBack}
            >
              Go Back and Fix
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
