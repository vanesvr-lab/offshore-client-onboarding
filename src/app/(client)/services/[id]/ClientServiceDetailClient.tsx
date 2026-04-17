"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Users,
  Files,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import { ServicePersonsManager } from "@/components/client/ServicePersonsManager";
import { calcServiceDetailsCompletion, calcDocumentsCompletion, calcPeopleCompletion, calcKycCompletion, calcOverallCompletion } from "@/lib/utils/serviceCompletion";
import { getClientStatusLabel } from "@/lib/utils/clientLabels";
import type { ServiceSectionOverride, DueDiligenceRequirement, DocumentType } from "@/types";
import type { ClientServiceRecord, ClientServiceDoc, ServicePerson } from "./page";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

interface Props {
  service: ClientServiceRecord;
  documents: ClientServiceDoc[];
  overrides: ServiceSectionOverride[];
  persons: ServicePerson[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  myRole: string;
  clientProfileId: string;
}

type RagStatus = "green" | "amber" | "red";

const RAG_COLORS: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

const OVERALL_BAR: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

function RagDot({ status }: { status: RagStatus }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${RAG_COLORS[status]}`} />;
}

function statusIcon(status: string) {
  if (status === "approved") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "rejected") return <AlertCircle className="h-5 w-5 text-red-500" />;
  if (status === "in_review" || status === "submitted") return <Clock className="h-5 w-5 text-amber-400" />;
  return <Clock className="h-5 w-5 text-gray-300" />;
}

function CollapsibleSection({
  id,
  title,
  icon: Icon,
  rag,
  pct,
  adminNote,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rag: RagStatus;
  pct: number;
  adminNote?: string | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card id={id}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center w-full p-4 text-left hover:bg-gray-50/50 transition-colors rounded-t-lg"
      >
        <Icon className="h-4 w-4 text-blue-500 mr-2 shrink-0" />
        <RagDot status={rag} />
        <span className="font-semibold text-brand-navy ml-2">{title}</span>
        <span className="ml-auto text-xs text-gray-400 mr-2">{pct}% complete</span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <CardContent className="pt-0 pb-6">
          {adminNote && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{adminNote}</p>
            </div>
          )}
          {children}
        </CardContent>
      )}
    </Card>
  );
}

export function ClientServiceDetailClient({
  service: initialService,
  documents,
  overrides,
  persons,
  requirements,
  documentTypes,
  myRole,
}: Props) {
  const router = useRouter();
  const [service, setService] = useState(initialService);
  const [editing, setEditing] = useState(false);
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    initialService.service_details ?? {}
  );
  const [saving, setSaving] = useState(false);

  const serviceFields = (service.service_templates?.service_fields ?? []) as ServiceField[];
  const overrideMap = new Map(overrides.map((o) => [o.section_key, o]));

  // Compute section completions
  const detailsOverride = overrideMap.get("service_details");
  const detailsCompletion = calcServiceDetailsCompletion(serviceFields, serviceDetails);
  const detailsRag: RagStatus = (detailsOverride?.override_status as RagStatus) ?? detailsCompletion.ragStatus;
  const detailsPct = detailsCompletion.percentage;

  const docsOverride = overrideMap.get("documents");
  const docsCompletion = calcDocumentsCompletion(documents);
  const docsRag: RagStatus = (docsOverride?.override_status as RagStatus) ?? docsCompletion.ragStatus;
  const docsPct = docsCompletion.percentage;

  const peopleCompletion = calcPeopleCompletion(persons);
  const kycCompletion = calcKycCompletion(persons);
  const peopleRag: RagStatus = peopleCompletion.ragStatus === "red" || kycCompletion.ragStatus === "red"
    ? "red"
    : peopleCompletion.ragStatus === "amber" || kycCompletion.ragStatus === "amber"
    ? "amber"
    : "green";
  const peoplePct = Math.round((peopleCompletion.percentage + kycCompletion.percentage) / 2);

  const overall = calcOverallCompletion([
    { percentage: detailsPct, ragStatus: detailsRag },
    { percentage: peoplePct, ragStatus: peopleRag },
    { percentage: docsPct, ragStatus: docsRag },
  ]);

  const isEditable = service.status === "draft" || service.status === "in_progress";

  async function saveDetails() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: serviceDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setService((prev) => ({ ...prev, service_details: serviceDetails }));
      setEditing(false);
      toast.success("Details saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-navy mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            {statusIcon(service.status)}
            <h1 className="text-2xl font-bold text-brand-navy">
              {service.service_templates?.name ?? "Service"}
            </h1>
          </div>
          {service.service_templates?.description && (
            <p className="text-sm text-gray-500 mt-0.5 ml-7">{service.service_templates.description}</p>
          )}
          <div className="ml-7 mt-1">
            <span className="text-sm text-gray-600">{getClientStatusLabel(service.status)}</span>
            {myRole && (
              <>
                <span className="text-gray-300 mx-2">·</span>
                <span className="text-sm capitalize text-gray-500">Your role: {myRole}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-brand-navy">Overall Progress</span>
          <span className="text-sm text-gray-500">{overall.percentage}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${OVERALL_BAR[overall.ragStatus]}`}
            style={{ width: `${overall.percentage}%` }}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {/* Section 1 — Service Details */}
        {serviceFields.length > 0 && (
          <CollapsibleSection
            id="section-service-details"
            title="Service Details"
            icon={FileText}
            rag={detailsRag}
            pct={detailsPct}
            adminNote={detailsOverride?.admin_note}
            defaultOpen={detailsRag !== "green"}
          >
            {editing ? (
              <div className="space-y-4">
                <DynamicServiceForm
                  fields={serviceFields}
                  values={serviceDetails}
                  onChange={(key, value) => setServiceDetails((prev) => ({ ...prev, [key]: value }))}
                />
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    onClick={() => void saveDetails()}
                    disabled={saving}
                    className="bg-brand-navy hover:bg-brand-blue"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setServiceDetails(service.service_details ?? {});
                      setEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <DynamicServiceForm
                  fields={serviceFields}
                  values={serviceDetails}
                  onChange={() => {}}
                  readOnly
                />
                {isEditable && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      Edit details
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Section 2 — People & KYC */}
        <CollapsibleSection
          id="section-people"
          title="People & KYC"
          icon={Users}
          rag={peopleRag}
          pct={peoplePct}
          defaultOpen={peopleRag !== "green"}
        >
          <ServicePersonsManager
            serviceId={service.id}
            initialPersons={persons}
            requirements={requirements}
            documentTypes={documentTypes}
          />
        </CollapsibleSection>

        {/* Section 3 — Documents */}
        <CollapsibleSection
          id="section-documents"
          title={`Documents (${documents.length})`}
          icon={Files}
          rag={docsRag}
          pct={docsPct}
          adminNote={docsOverride?.admin_note}
          defaultOpen={docsRag !== "green"}
        >
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400">
              No documents uploaded yet. Your account manager will request documents as needed.
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between border rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">{doc.file_name}</p>
                      <p className="text-[10px] text-gray-400">
                        {doc.document_types?.name ?? "Document"}
                        {doc.uploaded_at && ` · ${new Date(doc.uploaded_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium capitalize ${
                    doc.verification_status === "verified" ? "text-green-600" :
                    doc.verification_status === "flagged" ? "text-amber-600" :
                    doc.verification_status === "rejected" ? "text-red-600" :
                    "text-gray-400"
                  }`}>
                    {doc.verification_status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* KYC profile reminder */}
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-blue-700">
            Keep your personal KYC profile up to date.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="ml-4 shrink-0 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={() => router.push("/kyc")}
          >
            View KYC
          </Button>
        </div>
      </div>
    </div>
  );
}
