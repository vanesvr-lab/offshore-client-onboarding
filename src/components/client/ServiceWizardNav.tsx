"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  currentStep: number;
  totalSteps: number;
  saving: boolean;
  canSubmit: boolean;
  onSaveAndClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  /** B-043 — human-readable reasons why Submit is disabled; surfaced via tooltip. */
  submitBlockers?: string[];
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
  submitBlockers = [],
}: Props) {
  const isLast = currentStep === totalSteps - 1;
  const showSubmitTooltip = isLast && !canSubmit && submitBlockers.length > 0;

  const submitBtn = (
    <Button
      size="sm"
      onClick={onSubmit}
      disabled={!canSubmit || saving}
      className="bg-green-600 hover:bg-green-700 text-white"
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
      Submit ✓
    </Button>
  );

  return (
    <div className="fixed bottom-6 left-[260px] right-0 bg-white border-t border-x rounded-t-lg px-6 py-3 flex items-center justify-center gap-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <Button
        variant="outline"
        size="sm"
        onClick={onBack}
        disabled={currentStep === 0 || saving}
      >
        ← Back
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={onSaveAndClose}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
        Save &amp; Close
      </Button>

      {isLast ? (
        showSubmitTooltip ? (
          <TooltipProvider>
            <Tooltip>
              {/* Disabled buttons don't fire hover; wrap in span so the tooltip still works. */}
              <TooltipTrigger
                render={<span className="inline-block" tabIndex={0} />}
              >
                {submitBtn}
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium mb-1">Before submitting, please complete:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {submitBlockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          submitBtn
        )
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
  );
}
