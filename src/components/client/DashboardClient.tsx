"use client";

import Link from "next/link";
import { CheckCircle, Clock, AlertCircle, ArrowRight, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getClientStatusLabel } from "@/lib/utils/clientLabels";
import type { PendingAction } from "@/lib/utils/pendingActions";

type ServiceWithDetails = {
  id: string;
  status: string;
  service_templates: { name: string; description: string | null } | null;
};

interface Props {
  userName: string;
  services: ServiceWithDetails[];
  pendingActions: PendingAction[];
  allComplete: boolean;
}

const SECTION_BORDER: Record<string, string> = {
  service_details: "border-l-blue-500",
  people: "border-l-green-500",
  kyc: "border-l-amber-500",
  documents: "border-l-purple-500",
};

const SECTION_TEXT: Record<string, string> = {
  service_details: "text-blue-600",
  people: "text-green-600",
  kyc: "text-amber-600",
  documents: "text-purple-600",
};

const SECTION_LABEL: Record<string, string> = {
  service_details: "Service Details",
  people: "People",
  kyc: "KYC",
  documents: "Documents",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "rejected") return <AlertCircle className="h-5 w-5 text-red-500" />;
  if (status === "in_review" || status === "submitted") return <Clock className="h-5 w-5 text-amber-500" />;
  return <Clock className="h-5 w-5 text-gray-300" />;
}

export function DashboardClient({ userName, services, pendingActions, allComplete }: Props) {
  // Group pending actions by service
  const byService = new Map<string, { serviceName: string; actions: PendingAction[] }>();
  for (const action of pendingActions) {
    const existing = byService.get(action.serviceId);
    if (existing) {
      existing.actions.push(action);
    } else {
      byService.set(action.serviceId, { serviceName: action.serviceName, actions: [action] });
    }
  }

  return (
    <div className="space-y-6">
      {/* Greeting banner */}
      <div className={`rounded-xl px-5 py-4 ${allComplete ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
        <div className="flex items-start gap-3">
          {allComplete
            ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            : <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          }
          <div>
            <p className={`font-semibold ${allComplete ? "text-green-800" : "text-amber-800"}`}>
              {allComplete
                ? "All information provided! Your application is under review."
                : `Hi ${userName}, please provide the missing information below to complete your application.`
              }
            </p>
            {!allComplete && (
              <p className="text-sm text-amber-700 mt-0.5">
                Click any item below to go directly to that section.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pending actions */}
      {!allComplete && byService.size > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Action needed</h2>
          {Array.from(byService.entries()).map(([serviceId, { serviceName, actions }]) => (
            <div key={serviceId} className="space-y-2">
              {services.length > 1 && (
                <p className="text-xs font-medium text-gray-500 ml-1">{serviceName}</p>
              )}
              {actions.map((action, idx) => (
                <Link
                  key={`${action.section}-${idx}`}
                  href={`/services/${serviceId}${action.anchor ?? ""}`}
                >
                  <div className={`border-l-4 ${SECTION_BORDER[action.section] ?? "border-l-gray-300"} bg-white border border-gray-100 rounded-r-lg px-4 py-3 hover:shadow-sm transition-shadow cursor-pointer flex items-center justify-between`}>
                    <div>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${SECTION_TEXT[action.section] ?? "text-gray-500"}`}>
                        {SECTION_LABEL[action.section] ?? action.section}
                      </span>
                      <p className="text-sm text-gray-800 mt-0.5">
                        {action.personName ? (
                          <><span className="font-medium">{action.personName}</span> — {action.label}</>
                        ) : action.label}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 ml-4 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Service cards */}
      <div>
        {services.length > 1 && (
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Your Services</h2>
        )}
        <div className="grid gap-4">
          {services.map((svc) => (
            <Link key={svc.id} href={`/services/${svc.id}`}>
              <Card className="hover:border-brand-blue hover:shadow-sm transition-all cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <StatusIcon status={svc.status} />
                        <h2 className="font-semibold text-brand-navy">
                          {svc.service_templates?.name ?? "Service"}
                        </h2>
                      </div>
                      {svc.service_templates?.description && (
                        <p className="text-sm text-gray-500 mt-0.5 ml-7">{svc.service_templates.description}</p>
                      )}
                      <div className="ml-7 mt-1.5">
                        <span className="text-xs font-medium text-gray-600">
                          {getClientStatusLabel(svc.status)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4 text-brand-blue">
                      <span className="text-sm font-medium">
                        {svc.status === "draft" || svc.status === "in_progress" ? "Continue" : "View"}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
