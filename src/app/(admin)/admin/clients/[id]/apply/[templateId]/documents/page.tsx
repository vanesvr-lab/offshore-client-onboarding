"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardLayout } from "@/components/client/WizardLayout";
import { DocumentUploadStep } from "@/components/client/DocumentUploadStep";
import { Button } from "@/components/ui/button";
import { Check, Clock, AlertTriangle, Upload, Info } from "lucide-react";
import type { DocumentRequirement, DocumentUpload } from "@/types";

export default function AdminWizardDocumentsPage({
  params,
}: {
  params: { id: string; templateId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [uploads, setUploads] = useState<Record<string, DocumentUpload>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!applicationId) {
      router.push(`/admin/clients/${params.id}/apply/${params.templateId}/details`);
      return;
    }
    fetch(`/api/applications/${applicationId}`)
      .then((r) => r.json())
      .then(({ requirements: reqs, uploads: docs }) => {
        setRequirements(reqs ?? []);
        const uploadMap: Record<string, DocumentUpload> = {};
        (docs ?? []).forEach((u: DocumentUpload) => {
          uploadMap[u.requirement_id] = u;
        });
        setUploads(uploadMap);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, params.templateId]);

  function getStatusIcon(reqId: string) {
    const u = uploads[reqId];
    if (!u) return <Upload className="h-4 w-4 text-gray-400" />;
    if (u.verification_status === "verified") return <Check className="h-4 w-4 text-green-600" />;
    if (u.verification_status === "flagged") return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    if (u.verification_status === "manual_review") return <Info className="h-4 w-4 text-blue-500" />;
    return <Clock className="h-4 w-4 text-gray-400" />;
  }

  function canProceed() {
    return requirements.every((r) => {
      if (!r.is_required) return true;
      const u = uploads[r.id];
      return u && (u.verification_status === "verified" || u.verification_status === "manual_review");
    });
  }

  if (!applicationId) return null;
  if (loading) return <div className="flex items-center justify-center py-24 text-gray-400">Loading…</div>;

  return (
    <WizardLayout currentStep={2}>
      <div className="flex gap-6">
        <div className="w-64 shrink-0">
          <div className="rounded-lg border bg-white p-4 sticky top-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Documents ({requirements.length})
            </h3>
            <ul className="space-y-1">
              {requirements.map((req, idx) => (
                <li key={req.id}>
                  <button
                    onClick={() => setCurrentIdx(idx)}
                    className={`w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      idx === currentIdx ? "bg-brand-navy/10 text-brand-navy font-medium" : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    <span className="shrink-0">{getStatusIcon(req.id)}</span>
                    <span className="truncate">{req.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex-1">
          {requirements[currentIdx] && (
            <div className="rounded-lg border bg-white p-6">
              <DocumentUploadStep
                requirement={requirements[currentIdx]}
                applicationId={applicationId}
                existingUpload={uploads[requirements[currentIdx].id] || null}
                onUploadComplete={(upload) => {
                  setUploads((prev) => ({ ...prev, [requirements[currentIdx].id]: upload }));
                }}
              />
              <div className="flex justify-between mt-6 pt-4 border-t">
                <Button variant="outline" onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}>
                  Previous
                </Button>
                {currentIdx < requirements.length - 1 ? (
                  <Button className="bg-brand-navy hover:bg-brand-blue" onClick={() => setCurrentIdx(currentIdx + 1)}>
                    Next document
                  </Button>
                ) : (
                  <Button
                    className="bg-brand-navy hover:bg-brand-blue"
                    onClick={() => router.push(`/admin/clients/${params.id}/apply/${params.templateId}/review?applicationId=${applicationId}`)}
                    disabled={!canProceed()}
                  >
                    Proceed to Review
                  </Button>
                )}
              </div>
            </div>
          )}
          {requirements.length === 0 && (
            <div className="rounded-lg border bg-white p-8 text-center space-y-4">
              <p className="text-gray-400">No documents required for this template.</p>
              <Button
                className="bg-brand-navy hover:bg-brand-blue"
                onClick={() => router.push(`/admin/clients/${params.id}/apply/${params.templateId}/review?applicationId=${applicationId}`)}
              >
                Proceed to Review
              </Button>
            </div>
          )}
        </div>
      </div>
    </WizardLayout>
  );
}
