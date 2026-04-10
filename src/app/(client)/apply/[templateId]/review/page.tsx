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
import type { Application, ApplicationDetailsGbcAc } from "@/types";

interface PersonRecord {
  id: string;
  role: string;
  shareholding_percentage: number | null;
  kyc_records: {
    id: string;
    full_name: string | null;
    completion_status: string;
    nationality: string | null;
    passport_number: string | null;
  } | null;
}

interface LinkedDoc {
  id: string;
  file_name: string;
  verification_status: string;
  document_types?: { name: string };
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
  const [gbcDetails, setGbcDetails] = useState<ApplicationDetailsGbcAc | null>(null);
  const [persons, setPersons] = useState<PersonRecord[]>([]);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!applicationId) return;

    Promise.all([
      fetch(`/api/applications/${applicationId}`)
        .then((r) => r.json())
        .then(({ application: app }) => app ?? null),
      fetch(`/api/applications/${applicationId}/details-gbc-ac`)
        .then((r) => r.json())
        .then(({ details }) => details ?? null),
      fetch(`/api/applications/${applicationId}/persons`)
        .then((r) => r.json())
        .then(({ persons: p }) => p ?? []),
      fetch(`/api/documents/links?linkedToType=application&linkedToId=${applicationId}`)
        .then((r) => r.json())
        .then(({ links }: { links: Array<{ documents: LinkedDoc }> }) =>
          (links ?? []).map((l) => l.documents).filter(Boolean)
        ),
    ]).then(([app, gbc, pList, docs]) => {
      setApplication(app as Application | null);
      setGbcDetails(gbc as ApplicationDetailsGbcAc | null);
      setPersons(pList as PersonRecord[]);
      setLinkedDocs(docs as LinkedDoc[]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  // Compute blockers
  const blockers: string[] = [];
  if (application) {
    if (!application.business_name) blockers.push("Business name is required");
    if (!application.business_type) blockers.push("Business type is required");
    if (!application.business_country) blockers.push("Country of incorporation is required");
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

  return (
    <WizardLayout currentStep={3}>
      <div className="max-w-3xl space-y-6">
        {/* Business Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Business Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-600">Business name</span>
              <p>{application.business_name || "—"}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Type</span>
              <p>{application.business_type || "—"}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Country</span>
              <p>{application.business_country || "—"}</p>
            </div>
            <div className="col-span-2">
              <span className="font-medium text-gray-600">Address</span>
              <p>{application.business_address || "—"}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Primary contact</span>
              <p>{application.contact_name || "—"}</p>
            </div>
            <div>
              <span className="font-medium text-gray-600">Contact email</span>
              <p>{application.contact_email || "—"}</p>
            </div>
          </CardContent>
        </Card>

        {/* GBC/AC Details */}
        {gbcDetails && (
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy">GBC/AC Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              {gbcDetails.proposed_names && gbcDetails.proposed_names.filter(Boolean).length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-600">Proposed company names</span>
                  <ol className="list-decimal list-inside mt-1">
                    {gbcDetails.proposed_names.filter(Boolean).map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ol>
                </div>
              )}
              {gbcDetails.proposed_business_activity && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-600">Business activity</span>
                  <p>{gbcDetails.proposed_business_activity}</p>
                </div>
              )}
              {gbcDetails.geographical_area && (
                <div>
                  <span className="font-medium text-gray-600">Geographical area</span>
                  <p>{gbcDetails.geographical_area}</p>
                </div>
              )}
              {gbcDetails.transaction_currency && (
                <div>
                  <span className="font-medium text-gray-600">Currency</span>
                  <p>{gbcDetails.transaction_currency}</p>
                </div>
              )}
              {gbcDetails.estimated_turnover_3yr && (
                <div>
                  <span className="font-medium text-gray-600">Turnover (3yr est.)</span>
                  <p>{gbcDetails.estimated_turnover_3yr}</p>
                </div>
              )}
              {gbcDetails.initial_stated_capital && (
                <div>
                  <span className="font-medium text-gray-600">Initial capital</span>
                  <p>{gbcDetails.initial_stated_capital}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Persons */}
        {persons.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy">Directors, Shareholders &amp; UBOs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {persons.map((p) => {
                const kyc = p.kyc_records;
                const complete = kyc?.completion_status === "complete";
                return (
                  <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2.5 text-sm bg-gray-50">
                    <div>
                      <p className="font-medium">{kyc?.full_name || `Unnamed ${p.role}`}</p>
                      <p className="text-xs text-gray-500 capitalize">
                        {p.role}
                        {p.role === "shareholder" && p.shareholding_percentage !== null
                          ? ` — ${p.shareholding_percentage}%`
                          : ""}
                        {kyc?.nationality ? ` · ${kyc.nationality}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {complete ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="h-3.5 w-3.5" /> KYC complete
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" /> KYC incomplete
                        </span>
                      )}
                    </div>
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

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/apply/${params.templateId}/documents?applicationId=${applicationId}`)
            }
          >
            Back to Documents
          </Button>
          <Button
            className="bg-brand-navy hover:bg-brand-blue"
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
