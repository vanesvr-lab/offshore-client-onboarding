"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardLayout } from "@/components/client/WizardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { Application } from "@/types";

interface PersonKyc {
  id: string;
  full_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  occupation: string | null;
  address: string | null;
  source_of_funds_description: string | null;
  is_pep: boolean | null;
  legal_issues_declared: boolean | null;
  completion_status: string;
}

interface PersonRecord {
  id: string;
  role: string;
  shareholding_percentage: number | null;
  kyc_records: PersonKyc | null;
  doc_count: number;
}

interface LinkedDoc {
  id: string;
  file_name: string;
  verification_status: string;
  document_types?: { name: string };
}

const KYC_REQUIRED_FIELDS: (keyof PersonKyc)[] = [
  "full_name", "email", "date_of_birth", "nationality",
  "passport_number", "passport_expiry", "address", "occupation",
  "source_of_funds_description", "is_pep", "legal_issues_declared",
];
const KYC_TOTAL = KYC_REQUIRED_FIELDS.length;
const DOCS_TOTAL = 6;

function kycFilled(kyc: PersonKyc | null): number {
  if (!kyc) return 0;
  return KYC_REQUIRED_FIELDS.filter((f) => {
    const v = kyc[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
}

function PersonProgressRow({ person }: { person: PersonRecord }) {
  const kyc = person.kyc_records;
  const kycCount = kycFilled(kyc);
  const kycPct = Math.round((kycCount / KYC_TOTAL) * 100);
  const docPct = Math.round((Math.min(person.doc_count, DOCS_TOTAL) / DOCS_TOTAL) * 100);

  return (
    <div className="rounded border px-3 py-2.5 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div>
          <p className="font-medium text-brand-navy">{kyc?.full_name || `Unnamed ${person.role}`}</p>
          <p className="text-xs text-gray-500 capitalize">
            {person.role}
            {person.role === "shareholder" && person.shareholding_percentage !== null
              ? ` — ${person.shareholding_percentage}%`
              : ""}
            {kyc?.nationality ? ` · ${kyc.nationality}` : ""}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>KYC fields</span>
            <span>{kycCount}/{KYC_TOTAL}</span>
          </div>
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-brand-success transition-all" style={{ width: `${kycPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Documents</span>
            <span>{person.doc_count}/{DOCS_TOTAL}</span>
          </div>
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-brand-success transition-all" style={{ width: `${docPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockersList({ blockers }: { blockers: string[] }) {
  if (!blockers.length) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1">
      <p className="text-sm font-semibold text-amber-700">Required before submitting:</p>
      {blockers.map((b, i) => (
        <p key={i} className="text-sm text-amber-600 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {b}
        </p>
      ))}
    </div>
  );
}

export default function ReviewPage({
  params,
}: {
  params: { templateId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const [application, setApplication] = useState<Application | null>(null);
  const [serviceFields, setServiceFields] = useState<ServiceField[]>([]);
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>({});
  const [persons, setPersons] = useState<PersonRecord[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!applicationId) return;

    Promise.all([
      fetch(`/api/applications/${applicationId}`)
        .then((r) => r.json())
        .then(({ application: app }) => app ?? null),
      fetch(`/api/templates/${params.templateId}`)
        .then((r) => r.json())
        .then(({ template }) => template ?? null),
      fetch(`/api/applications/${applicationId}/persons`)
        .then((r) => r.json())
        .then(({ persons: p }) => p ?? []),
      fetch(`/api/documents/links?linkedToType=application&linkedToId=${applicationId}`)
        .then((r) => r.json())
        .then(({ links }: { links: Array<{ documents: LinkedDoc }> }) =>
          (links ?? []).map((l) => l.documents).filter(Boolean)
        ),
    ]).then(([app, tpl, pList, docs]) => {
      setApplication(app as Application | null);
      if (tpl?.service_fields && Array.isArray(tpl.service_fields)) {
        setServiceFields(tpl.service_fields as ServiceField[]);
      }
      if ((app as Application & { service_details?: Record<string, unknown> })?.service_details) {
        setServiceDetails((app as Application & { service_details?: Record<string, unknown> }).service_details ?? {});
      }
      setPersons(pList as PersonRecord[]);
      setLinkedDocs(docs as LinkedDoc[]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  // Compute blockers
  const blockers: string[] = [];
  if (application) {
    if (!application.contact_name) blockers.push("Primary contact name is required");
    if (!application.contact_email) blockers.push("Primary contact email is required");
  }
  if (persons.length === 0) blockers.push("At least one director, shareholder, or UBO is required");

  async function handleSubmit() {
    if (!applicationId || blockers.length > 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Submission failed");
      toast.success("Application submitted successfully!");
      router.push(`/applications/${applicationId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!application)
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">Loading…</div>
    );

  // Group persons by role for display
  const roles = ["director", "shareholder", "ubo"] as const;
  const roleLabel: Record<string, string> = { director: "Directors", shareholder: "Shareholders", ubo: "UBOs" };

  return (
    <WizardLayout currentStep={3}>
      <div className="max-w-3xl space-y-6">
        {/* Primary Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Primary Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-600">Name</span>
              <p>{application.contact_name || "—"}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Email</span>
              <p>{application.contact_email || "—"}</p>
            </div>
            {application.contact_phone && (
              <div>
                <span className="font-medium text-gray-600">Phone</span>
                <p>{application.contact_phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Details (readOnly DynamicServiceForm) */}
        {serviceFields.length > 0 && (
          <DynamicServiceForm
            fields={serviceFields}
            values={serviceDetails}
            onChange={() => {}}
            readOnly
          />
        )}

        {/* Directors, Shareholders & UBOs */}
        {persons.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy">Directors, Shareholders &amp; UBOs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {roles.map((role) => {
                const group = persons.filter((p) => p.role === role);
                if (group.length === 0) return null;
                return (
                  <div key={role} className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {roleLabel[role]} ({group.length})
                    </p>
                    {group.map((p) => (
                      <PersonProgressRow key={p.id} person={p} />
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Documents ({linkedDocs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {linkedDocs.length === 0 ? (
              <p className="text-sm text-gray-400">No documents uploaded yet.</p>
            ) : (
              <ul className="divide-y">
                {linkedDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{doc.document_types?.name ?? doc.file_name}</span>
                    <span className={`flex items-center gap-1 text-xs ${
                      doc.verification_status === "verified" ? "text-green-600" : "text-amber-600"
                    }`}>
                      {doc.verification_status === "verified" ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {doc.verification_status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Blockers */}
        <BlockersList blockers={blockers} />

        {/* B-047 §4 — Back = tertiary, Submit = primary brand-navy 44pt. */}
        <div className="flex items-center justify-between">
          <Button
            onClick={() =>
              router.push(`/apply/${params.templateId}/documents?applicationId=${applicationId}`)
            }
            className="h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent"
          >
            ← Back to Documents
          </Button>
          <Button
            className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90"
            onClick={handleSubmit}
            disabled={blockers.length > 0 || submitting}
            title={blockers.length > 0 ? "Resolve all blockers before submitting" : ""}
          >
            {submitting ? "Submitting…" : "Submit Application"}
          </Button>
        </div>
      </div>
    </WizardLayout>
  );
}
