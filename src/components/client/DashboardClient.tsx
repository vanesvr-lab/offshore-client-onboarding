"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, ArrowRight, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientStatusLabel } from "@/lib/utils/clientLabels";

type ServiceSection = {
  label: string;
  complete: boolean;
  wizardStep: number;
};

type ServiceCardRow = {
  id: string;
  status: string;
  service_templates: { name: string; description: string | null } | null;
  overallPct: number;
  sections: ServiceSection[];
};

interface Props {
  userName: string;
  firstName: string | null;
  services: ServiceCardRow[];
  allComplete: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-50 text-blue-700",
  submitted: "bg-indigo-50 text-indigo-700",
  in_review: "bg-amber-50 text-amber-700",
  pending_action: "bg-orange-50 text-orange-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

function ServiceCard({ svc }: { svc: ServiceCardRow }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const badgeClass = STATUS_BADGE[svc.status] ?? "bg-gray-100 text-gray-600";

  const progressBarColor =
    svc.overallPct === 100
      ? "bg-green-500"
      : svc.overallPct > 0
      ? "bg-amber-500"
      : "bg-gray-300";

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4">
        {/* Service name + status badge */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="font-semibold text-brand-navy text-base leading-snug">
            {svc.service_templates?.name ?? "Service"}
          </h2>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize shrink-0 ${badgeClass}`}
          >
            {getClientStatusLabel(svc.status)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mt-2.5 mb-3">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressBarColor}`}
              style={{ width: `${svc.overallPct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 tabular-nums shrink-0">
            {svc.overallPct}% complete
          </span>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" /> Hide sections</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" /> Show sections</>
            )}
          </button>

          <Button
            size="sm"
            onClick={() => router.push(`/services/${svc.id}?startWizard=true`)}
            className="bg-brand-navy hover:bg-brand-blue h-8 px-3 text-xs gap-1"
          >
            Review and Complete
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Collapsible sections */}
      {expanded && (
        <div className="border-t divide-y">
          {svc.sections.map((section) => (
            <div
              key={section.label}
              className="flex items-center justify-between px-5 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                {section.complete ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                )}
                <span className="text-sm text-gray-700">{section.label}</span>
                <span
                  className={`text-[10px] font-medium ${
                    section.complete ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {section.complete ? "Complete" : "Incomplete"}
                </span>
              </div>
              <button
                onClick={() =>
                  router.push(`/services/${svc.id}?wizardStep=${section.wizardStep}`)
                }
                className="text-xs text-brand-blue hover:underline flex items-center gap-0.5"
              >
                Review
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardClient({ userName, firstName, services, allComplete }: Props) {
  if (allComplete) {
    return (
      <div className="space-y-6">
        {/* Greeting — all complete */}
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Welcome {userName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            All sections complete! Your application is under review.
          </p>
        </div>

        {/* Service cards */}
        <div className="space-y-4">
          {services.map((svc) => (
            <ServiceCard key={svc.id} svc={svc} />
          ))}
        </div>
      </div>
    );
  }

  // Missing-info path — point user at the Review CTA on the cards below
  const greetingLead = firstName ? `Welcome, ${firstName}.` : "Welcome back.";

  return (
    <div className="space-y-4">
      {/* Greeting card with downward visual cue */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <p className="text-sm text-amber-900">
          <span className="font-semibold text-brand-navy">{greetingLead}</span>{" "}
          Your application is missing some information — click{" "}
          <span className="font-semibold">Review</span> below to complete it.
        </p>
        <div className="flex justify-center mt-2 -mb-1 text-amber-500">
          <ArrowDown className="h-4 w-4 animate-bounce" />
        </div>
      </div>

      {/* Service cards */}
      <div className="space-y-4">
        {services.map((svc) => (
          <ServiceCard key={svc.id} svc={svc} />
        ))}
      </div>
    </div>
  );
}
