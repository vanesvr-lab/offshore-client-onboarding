"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardLayout } from "@/components/client/WizardLayout";
import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, Link2, Upload, AlertTriangle } from "lucide-react";
import type { DocumentRecord, DocumentType } from "@/types";

interface LinkedDoc extends DocumentRecord {
  document_types?: { id: string; name: string; category: string };
  source?: "kyc_reused" | "uploaded";
}

function fmt(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DocumentsPage({
  params,
}: {
  params: { templateId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("applicationId");

  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!applicationId) {
      router.push(`/apply/${params.templateId}/details`);
      return;
    }

    Promise.all([
      fetch(`/api/applications/${applicationId}`)
        .then((r) => r.json())
        .then(({ application }) => {
          if (application?.client_id) setClientId(application.client_id);
          return application;
        }),
      fetch(`/api/documents/links?linkedToType=application&linkedToId=${applicationId}`)
        .then((r) => r.json())
        .then(({ links }: { links: Array<{ documents: LinkedDoc }> }) =>
          (links ?? []).map((l) => l.documents).filter(Boolean)
        ),
      fetch("/api/document-types")
        .then((r) => r.json())
        .then(({ types }) => types ?? []),
    ]).then(([, links, types]) => {
      setLinkedDocs(links);
      setDocumentTypes(types);
      setLoading(false);
    });
  // eslint-disable name/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, params.templateId]);

  async function linkDocument(doc: DocumentRecord) {
    if (!applicationId) return;
    const res = await fetch(`/api/documents/${doc.id}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkedToType: "application", linkedToId: applicationId }),
    });
    if (res.ok) {
      setLinkedDocs((prev) => [...prev, doc as LinkedDoc]);
    }
  }

  if (!applicationId) return null;
  if (loading)
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">Loading…</div>
    );

  return (
    <WizardLayout currentStep={2}>
      <div className="max-w-3xl space-y-6">
        {/* Linked documents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Documents ({linkedDocs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {linkedDocs.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No documents linked yet.</p>
            ) : (
              <div className="divide-y">
                {linkedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {doc.verification_status === "verified" ? (
                        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-brand-navy truncate">
                          {doc.document_types?.name ?? doc.file_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {doc.source === "kyc_reused" ? (
                            <span className="flex items-center gap-1">
                              <Link2 className="h-3 w-3" /> From KYC library
                            </span>
                          ) : (
                            `Uploaded ${fmt(doc.uploaded_at)}`
                          )}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                      doc.verification_status === "verified"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {doc.verification_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload new documents */}
        {clientId && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-gray-400" />
                <CardTitle className="text-brand-navy">Upload Document</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Upload documents for this application. They will be added to your document
                library and linked here automatically.
              </p>
              <DocumentUploadWidget
                clientId={clientId}
                showTypeSelector
                documentTypes={documentTypes}
                onUploadComplete={linkDocument}
              />
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/apply/${params.templateId}/details?applicationId=${applicationId}`)
            }
          >
            Back
          </Button>
          <Button
            className="bg-brand-navy hover:bg-brand-blue"
            onClick={() =>
              router.push(`/apply/${params.templateId}/review?applicationId=${applicationId}`)
            }
          >
            Proceed to Review
          </Button>
        </div>
      </div>
    </WizardLayout>
  );
}
