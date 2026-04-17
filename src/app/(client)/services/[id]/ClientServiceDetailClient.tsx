"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, FileText, CheckCircle, AlertCircle, Clock, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import type { ServiceSectionOverride } from "@/types";
import type { ClientServiceRecord, ClientServiceDoc } from "./page";

interface Props {
  service: ClientServiceRecord;
  documents: ClientServiceDoc[];
  overrides: ServiceSectionOverride[];
  myRole: string;
  clientProfileId: string;
}

type RagStatus = "green" | "amber" | "red";

const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

function RagDot({ status }: { status: RagStatus }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${RAG_DOT[status]}`} />;
}

function statusIcon(status: string) {
  if (status === "approved") return <CheckCircle className="h-5 w-5 text-green-500" />;
  if (status === "rejected") return <AlertCircle className="h-5 w-5 text-red-500" />;
  return <Clock className="h-5 w-5 text-amber-400" />;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft — in progress",
    in_progress: "In progress",
    submitted: "Submitted — under review",
    in_review: "Under review",
    approved: "Approved",
    rejected: "Rejected",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

function CollapsibleSection({
  title,
  rag,
  adminNote,
  defaultOpen = true,
  children,
}: {
  title: string;
  rag: RagStatus;
  adminNote?: string | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <RagDot status={rag} />
          <span className="font-semibold text-brand-navy">{title}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
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
  myRole,
}: Props) {
  const router = useRouter();
  const [service, setService] = useState(initialService);
  const [editing, setEditing] = useState(false);
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    initialService.service_details ?? {}
  );
  const [saving, setSaving] = useState(false);

  const serviceFields = service.service_templates?.service_fields ?? [];
  const overrideMap = new Map(overrides.map((o) => [o.section_key, o]));

  // Auto-calc RAG for service details
  const detailsOverride = overrideMap.get("service_details");
  let detailsRag: RagStatus = detailsOverride?.override_status ?? "green";
  if (!detailsOverride) {
    const required = serviceFields.filter((f) => f.required);
    if (required.length > 0) {
      const filled = required.filter((f) => {
        const v = serviceDetails[f.key];
        if (Array.isArray(v)) return v.length > 0;
        return v != null && v !== "";
      });
      detailsRag = filled.length === required.length ? "green" : filled.length > 0 ? "amber" : "red";
    } else {
      const anyFilled = serviceFields.some((f) => {
        const v = serviceDetails[f.key];
        if (Array.isArray(v)) return v.length > 0;
        return v != null && v !== "";
      });
      detailsRag = anyFilled ? "green" : serviceFields.length === 0 ? "green" : "amber";
    }
  }

  const docsOverride = overrideMap.get("documents");
  let docsRag: RagStatus = docsOverride?.override_status ?? "red";
  if (!docsOverride) {
    if (documents.length === 0) {
      docsRag = "red";
    } else if (documents.some((d) => d.verification_status === "flagged" || d.verification_status === "rejected")) {
      docsRag = "amber";
    } else {
      docsRag = "green";
    }
  }

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
            <span className="text-sm text-gray-600">{statusLabel(service.status)}</span>
            {myRole && (
              <>
                <span className="text-gray-300 mx-2">·</span>
                <span className="text-sm capitalize text-gray-500">Your role: {myRole}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {/* Service details */}
        {serviceFields.length > 0 && (
          <CollapsibleSection
            title="Service Details"
            rag={detailsRag}
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

        {/* Documents */}
        <CollapsibleSection
          title={`Documents (${documents.length})`}
          rag={docsRag}
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

        {/* KYC reminder */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-brand-navy">Your KYC Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">
              Keep your KYC profile up to date. Your account manager uses it for compliance verification.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/kyc")}
            >
              View / update KYC
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
