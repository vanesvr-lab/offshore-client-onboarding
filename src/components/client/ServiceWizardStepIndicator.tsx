"use client";

const STEP_LABELS = ["Company Setup", "Financial", "Banking", "People & KYC", "Documents"];

interface Props {
  currentStep: number;       // 0-indexed
  completedSteps: number[];  // indices of completed steps
  onStepClick: (step: number) => void;
}

export function ServiceWizardStepIndicator({ currentStep, completedSteps, onStepClick }: Props) {
  return (
    <div className="space-y-3 mb-6">
      {/* Dots + arrows row */}
      <div className="flex items-center">
        {STEP_LABELS.map((label, i) => {
          const isComplete = completedSteps.includes(i);
          const isCurrent = i === currentStep;
          const isClickable = isComplete || i <= currentStep;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <button
                onClick={() => isClickable && onStepClick(i)}
                disabled={!isClickable}
                className={`relative h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors shrink-0
                  ${isCurrent ? "bg-blue-500 text-white ring-2 ring-blue-300" :
                    isComplete ? "bg-green-500 text-white cursor-pointer hover:bg-green-600" :
                    "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                title={label}
              >
                {isComplete && !isCurrent ? "✓" : i + 1}
              </button>
              {i < STEP_LABELS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${isComplete ? "bg-green-400" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>
      {/* Label + step counter */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-brand-navy">{STEP_LABELS[currentStep]}</p>
        <p className="text-xs text-gray-400">Step {currentStep + 1} of {STEP_LABELS.length}</p>
      </div>
    </div>
  );
}
