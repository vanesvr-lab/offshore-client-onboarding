import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusTimeline } from "@/components/client/StatusTimeline";

export const dynamic = "force-dynamic";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WorkflowTracker } from "@/components/admin/WorkflowTracker";
import { ApplicationStatusPanel } from "@/components/shared/ApplicationStatusPanel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CheckCircle, AlertTriangle } from "lucide-react";
import type { Application } from "@/types";

export default async function ApplicationStatusPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

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

  const [
    { data: persons },
    { data: docLinks },
  ] = await Promise.all([
    adminSupabase
      .from("application_persons")
      .select(`
        id, role, shareholding_percentage,
        kyc_records!kyc_record_id(full_name, completion_status, nationality)
      `)
      .eq("application_id", params.id)
      .order("created_at"),
    adminSupabase
      .from("document_links")
      .select("*, documents(id, file_name, verification_status, document_types(name))")
      .eq("linked_to_type", "application")
      .eq("linked_to_id", params.id)
      .order("linked_at", { ascending: false }),
  ]);

  const app = application as Application & {
    service_templates?: { name: string };
  };

  type PersonRow = {
    id: string;
    role: string;
    shareholding_percentage: number | null;
    kyc_records: { full_name: string | null; completion_status: string; nationality: string | null } | null;
  };

  type DocLinkRow = {
    id: string;
    documents: {
      id: string;
      file_name: string;
      verification_status: string;
      document_types: { name: string } | null;
    } | null;
  };

  const typedPersons = (persons ?? []) as unknown as PersonRow[];
  const typedLinks = (docLinks ?? []) as unknown as DocLinkRow[];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            {app.reference_number || app.business_name || "Application"}
          </h1>
          <p className="text-gray-500 text-sm">{app.service_templates?.name}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      {/* Workflow progress tracker */}
      <div className="rounded-lg border bg-white px-6 py-5">
        <WorkflowTracker status={app.status} />
      </div>

      {/* Two-column layout: main content + status panel.
          B-052: stack to one column below md:; main spans full width on mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: main content */}
        <div className="md:col-span-2 space-y-6">
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
              Your application has been approved. We will be in touch shortly.
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

          {/* Persons */}
          {typedPersons.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-brand-navy">Directors, Shareholders &amp; UBOs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {typedPersons.map((p) => {
                  const kyc = p.kyc_records;
                  const complete = kyc?.completion_status === "complete";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded border px-3 py-2.5 text-sm bg-gray-50"
                    >
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
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy">
                Documents ({typedLinks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {typedLinks.length === 0 ? (
                <p className="text-sm text-gray-400">No documents uploaded yet.</p>
              ) : (
                <ul className="divide-y">
                  {typedLinks.map((link) => {
                    const doc = link.documents;
                    if (!doc) return null;
                    return (
                      <li
                        key={link.id}
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <span>{doc.document_types?.name ?? doc.file_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                          doc.verification_status === "verified"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                          {doc.verification_status}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* B-047 §4.4 — back-navigation: gray-600 link, no border. */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 h-11 px-3 text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            <span aria-hidden="true">←</span>
            Back to Dashboard
          </Link>
        </div>

        {/* Right: Application Status Panel */}
        <div>
          <ApplicationStatusPanel
            application={{
              business_name: app.business_name,
              status: app.status,
              admin_notes: app.admin_notes,
            }}
            requirements={[]}
            uploads={[]}
          />
        </div>
      </div>
    </div>
  );
}
