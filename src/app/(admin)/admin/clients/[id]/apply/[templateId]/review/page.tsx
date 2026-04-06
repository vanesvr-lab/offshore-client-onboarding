"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardLayout } from "@/components/client/WizardLayout";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { Application, DocumentRequirement, DocumentUpload } from "@/types";

export default function AdminWizardReviewPage({
  params,
}: {
  params: { id: string; templateId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const [application, setApplication] = useState<Application | null>(null);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [uploads, setUploads] = useState<DocumentUpload[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!applicationId) return;
    fetch(`/api/applications/${applicationId}`)
      .then((r) => r.json())
      .then(({ application: app, requirements: reqs, uploads: docs }) => {
        setApplication(app ?? null);
        setRequirements(reqs ?? []);
        setUploads(docs ?? []);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  function canSubmit() {
    return requirements.every((r) => {
      if (!r.is_required) return true;
      const u = uploads.find((u) => u.requirement_id === r.id);
      return u && (u.verification_status === "verified" || u.verification_status === "manual_review");
    });
  }

  async function handleSubmit() {
    if (!applicationId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Submission failed");
      toast.success("Application submitted");
      router.push(`/admin/applications/${applicationId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!application) return <div className="flex items-center justify-center py-24 text-gray-400">Loading…</div>;

  return (
    <WizardLayout currentStep={3}>
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Business Information</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium text-gray-600">Business name</span><p>{application.business_name || "—"}</p></div>
            <div><span className="font-medium text-gray-600">Type</span><p>{application.business_type || "—"}</p></div>
            <div><span className="font-medium text-gray-600">Country</span><p>{application.business_country || "—"}</p></div>
            <div className="col-span-2"><span className="font-medium text-gray-600">Address</span><p>{application.business_address || "—"}</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Primary Contact</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium text-gray-600">Name</span><p>{application.contact_name || "—"}</p></div>
            <div><span className="font-medium text-gray-600">Email</span><p>{application.contact_email || "—"}</p></div>
            <div><span className="font-medium text-gray-600">Phone</span><p>{application.contact_phone || "—"}</p></div>
          </CardContent>
        </Card>

        {application.ubo_data && application.ubo_data.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-brand-navy">Ultimate Beneficial Owners</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {application.ubo_data.map((ubo, idx) => (
                <div key={idx} className="text-sm border rounded p-3 bg-gray-50">
                  <p className="font-medium">{ubo.full_name}</p>
                  <p className="text-gray-500">{ubo.nationality} · {ubo.ownership_percentage}% ownership · DOB: {ubo.date_of_birth}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-brand-navy">Documents</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {requirements.map((req) => {
                const upload = uploads.find((u) => u.requirement_id === req.id);
                return (
                  <li key={req.id} className="flex items-center justify-between py-2 text-sm">
                    <span className={req.is_required ? "" : "text-gray-500"}>
                      {req.name}{!req.is_required && " (optional)"}
                    </span>
                    {upload ? (
                      <VerificationBadge status={upload.verification_status} />
                    ) : (
                      <span className="text-xs text-gray-400">Not uploaded</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {!canSubmit() && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            All required documents must be uploaded and verified (or queued for manual review) before submitting.
          </div>
        )}

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push(`/admin/clients/${params.id}/apply/${params.templateId}/documents?applicationId=${applicationId}`)}
          >
            Back to Documents
          </Button>
          <Button
            className="bg-brand-navy hover:bg-brand-blue"
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting}
          >
            {submitting ? "Submitting…" : "Submit Application"}
          </Button>
        </div>
      </div>
    </WizardLayout>
  );
}
