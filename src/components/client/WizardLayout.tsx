import { Check } from "lucide-react";

interface WizardLayoutProps {
  currentStep: 1 | 2 | 3;
  children: React.ReactNode;
}

const steps = [
  { num: 1, label: "Business Details" },
  { num: 2, label: "Documents" },
  { num: 3, label: "Review & Submit" },
];

export function WizardLayout({ currentStep, children }: WizardLayoutProps) {
  return (
    <div>
      {/* Step indicator */}
      <nav className="mb-8">
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
