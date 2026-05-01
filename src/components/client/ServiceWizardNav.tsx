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

// B-047 — Three-tier button system across the client portal.
//   primary   = bg-brand-navy text-white, h-11, font-semibold (Next, Submit, Confirm)
//   secondary = bg-white border-gray-300 text-gray-700, h-11        (Save & Close)
//   tertiary  = text-gray-600 link-style, no border, no fill, h-11   (Back)
// One Primary per screen.
const PRIMARY = "h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90";
const SECONDARY = "h-11 px-5 bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50";
const TERTIARY = "h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent";

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
      onClick={onSubmit}
      disabled={!canSubmit || saving}
      className={PRIMARY}
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
      Submit
    </Button>
  );

  return (
    <div className="fixed bottom-6 left-[260px] right-0 bg-white border-t border-x rounded-t-lg px-6 py-3 flex items-center justify-center gap-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <Button
        onClick={onBack}
        disabled={currentStep === 0 || saving}
        className={TERTIARY}
        aria-label="Back to previous step"
      >
        ← Back
      </Button>

      <Button
        onClick={onSaveAndClose}
        disabled={saving}
        className={SECONDARY}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
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
          onClick={onNext}
          disabled={saving}
          className={PRIMARY}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Next →
        </Button>
      )}
    </div>
  );
}
