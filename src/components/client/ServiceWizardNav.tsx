"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  currentStep: number;
  totalSteps: number;
  saving: boolean;
  canSubmit: boolean;
  onSaveAndClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

export function ServiceWizardNav({
  currentStep,
  totalSteps,
  saving,
  canSubmit,
  onSaveAndClose,
  onBack,
  onNext,
  onSubmit,
}: Props) {
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className="fixed bottom-0 left-[260px] right-0 bg-white border-t px-6 py-3 flex items-center justify-between gap-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <Button
        variant="outline"
        size="sm"
        onClick={onSaveAndClose}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
        Save &amp; Close
      </Button>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          disabled={currentStep === 0 || saving}
        >
          ← Back
        </Button>

        {isLast ? (
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={!canSubmit || saving}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Submit ✓
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onNext}
            disabled={saving}
            className="bg-brand-navy hover:bg-brand-blue"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Next →
          </Button>
        )}
      </div>
    </div>
  );
}
