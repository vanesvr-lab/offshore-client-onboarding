import { Check } from "lucide-react";

interface WizardLayoutProps {
  currentStep: 1 | 2 | 3;
  children: React.ReactNode;
}

const steps = [
  { num: 1, label: "Solution Details" },
  { num: 2, label: "Documents" },
  { num: 3, label: "Review & Submit" },
];

export function WizardLayout({ currentStep, children }: WizardLayoutProps) {
  // B-048 §1 (ui-ux-pro-max container-width) — narrow centered column for
  // form-heavy wizard pages so content sits in foveal vision on desktop.
  // B-052 §2.4 — mobile stepper collapses to "Step X of 3 — Label" + a slim
  // progress bar so the full stepper doesn't horizontal-scroll at 375px.
  const current = steps[currentStep - 1];
  const progressPct = (currentStep / steps.length) * 100;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Mobile stepper (below sm:) */}
      <div className="mb-6 sm:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-brand-navy">
            Step {currentStep} of {steps.length}
          </span>
          <span className="text-gray-500">{current.label}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-navy transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Full stepper (sm: and up) */}
      <nav className="mb-8 hidden sm:block">
        <ol className="flex items-center">
          {steps.map((step, idx) => (
            <li key={step.num} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    step.num < currentStep
                      ? "bg-brand-navy text-white"
                      : step.num === currentStep
                      ? "bg-brand-blue text-white"
                      : "border-2 border-gray-300 text-gray-400"
                  }`}
                >
                  {step.num < currentStep ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.num
                  )}
                </span>
                <span
                  className={`text-sm font-medium ${
                    step.num <= currentStep
                      ? "text-brand-navy"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`mx-4 h-0.5 w-16 ${
                    step.num < currentStep ? "bg-brand-navy" : "bg-gray-200"
                  }`}
                />
              )}
            </li>
          ))}
        </ol>
      </nav>
      {children}
    </div>
  );
}
