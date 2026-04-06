import { createClient } from "@/lib/supabase/server";
import { StatusTimeline } from "@/components/client/StatusTimeline";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Application, DocumentUpload, DocumentRequirement } from "@/types";

export default async function ApplicationStatusPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  const { data: application } = await supabase
    .from("applications")
    .select("*, service_templates(name)")
    .eq("id", params.id)
    .single();

  if (!application)
    return (
      <div className="text-center py-16 text-gray-500">
        Application not found.
      </div>
    );

  const { data: uploads } = await supabase
    .from("document_uploads")
    .select("*, document_requirements(name)")
    .eq("application_id", params.id);

  const app = application as Application & {
    service_templates?: { name: string };
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            {app.business_name || "Application"}
          </h1>
          <p className="text-gray-500 text-sm">{app.service_templates?.name}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {/* Stage timeline */}
      <Card>
        <CardContent className="pt-6">
          <StatusTimeline application={app} />
        </CardContent>
      </Card>

      {/* Action banners */}
      {app.status === "pending_action" && app.admin_notes && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-700 mb-1">
            Action required
          </p>
          <p className="text-sm text-orange-600">{app.admin_notes}</p>
          <Link
            href={`/apply/${app.template_id}/documents?applicationId=${app.id}`}
            className="mt-3 inline-block"
          >
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
              Re-upload Documents
            </Button>
          </Link>
        </div>
      )}

      {app.status === "approved" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
          🎉 Your application has been approved. We will be in touch shortly.
        </div>
      )}

      {app.status === "rejected" && app.rejection_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700 mb-1">
            Application rejected
          </p>
          <p className="text-sm text-red-600">{app.rejection_reason}</p>
        </div>
      )}

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-brand-navy">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {!uploads || uploads.length === 0 ? (
            <p className="text-sm text-gray-400">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y">
              {(uploads as (DocumentUpload & { document_requirements?: DocumentRequirement })[]).map((upload) => (
                <li
                  key={upload.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>{upload.document_requirements?.name}</span>
                  <VerificationBadge status={upload.verification_status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Link href="/dashboard">
        <Button variant="outline">← Back to Dashboard</Button>
      </Link>
    </div>
  );
}
