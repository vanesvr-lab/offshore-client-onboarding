import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { StageSelector } from "@/components/admin/StageSelector";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { AccountManagerPanel } from "@/components/admin/AccountManagerPanel";
import { WorkflowTracker } from "@/components/admin/WorkflowTracker";
import { FlaggedDiscrepanciesCard } from "@/components/admin/FlaggedDiscrepanciesCard";
import { ApplicationStatusPanel } from "@/components/shared/ApplicationStatusPanel";
import { EditableApplicationDetails } from "@/components/admin/EditableApplicationDetails";
import { AdminDocumentUploader } from "@/components/admin/AdminDocumentUploader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import type {
  Application,
  DocumentUpload,
  DocumentRequirement,
  AuditLogEntry,
  EmailLogEntry,
  ApplicationStatus,
  ClientAccountManager,
  VerificationResult,
} from "@/types";

export default async function ApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createAdminClient();

  const [
    { data: application },
    { data: uploads },
    { data: auditLog },
    { data: emailLog },
    { data: allAdmins },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*, clients(company_name), service_templates(name)")
      .eq("id", params.id)
      .single(),
    supabase
      .from("document_uploads")
      .select("*, document_requirements(name, category)")
      .eq("application_id", params.id)
      .order("uploaded_at"),
    supabase
      .from("audit_log")
      .select("id, application_id, action, actor_id, actor_role, actor_name, entity_type, entity_id, previous_value, new_value, detail, created_at, profiles(full_name)")
      .eq("application_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_log")
      .select("*")
      .eq("application_id", params.id)
      .order("sent_at", { ascending: false }),
    supabase
      .from("admin_users")
      .select("user_id, profiles(full_name, email)")
      .order("created_at"),
  ]);

  if (!application) notFound();

  const appTyped = application as Application & {
    clients?: { company_name: string | null };
    service_templates?: { name: string };
  };

  // Fetch requirements for task data and status panel
  const { data: requirements } = appTyped.template_id
    ? await supabase
        .from("document_requirements")
        .select("id, name, category")
        .eq("template_id", appTyped.template_id)
        .order("sort_order")
    : { data: [] };

  // Fetch account manager history
  const clientId = (application as { client_id: string }).client_id;
  const { data: managerHistory } = await supabase
    .from("client_account_managers")
    .select("*, profiles!admin_id(full_name, email)")
    .eq("client_id", clientId)
    .order("started_at", { ascending: false });

  const currentManager =
    (managerHistory || []).find((m) => m.ended_at === null) ?? null;
  const pastManagers =
    (managerHistory || []).filter((m) => m.ended_at !== null);

  const app = appTyped;
  const clientEmail = app.contact_email || "";

  const typedUploads = (uploads || []) as (DocumentUpload & {
    document_requirements?: DocumentRequirement | null;
  })[];

  const flaggedUploads = typedUploads.filter(
    (u) => u.verification_status === "flagged"
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/queue"
            className="text-sm text-brand-blue hover:underline mb-1 block"
          >
            ← Back to queue
          </Link>
          <h1 className="text-2xl font-bold text-brand-navy">
            {app.business_name || "Application"}
          </h1>
          <p className="text-gray-500 text-sm">{app.service_templates?.name}</p>
        </div>
        <StatusBadge status={app.status as ApplicationStatus} />
      </div>

      {/* Workflow progress tracker */}
      <div className="mb-6 rounded-lg border bg-white px-6 py-5">
        <WorkflowTracker status={app.status as ApplicationStatus} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Application info (col-span-2) */}
        <div className="col-span-2 space-y-6">
          <EditableApplicationDetails
            app={{
              id: app.id,
              business_name: app.business_name ?? null,
              business_type: app.business_type ?? null,
              business_country: app.business_country ?? null,
              business_address: app.business_address ?? null,
              contact_name: app.contact_name ?? null,
              contact_email: app.contact_email ?? null,
              contact_phone: app.contact_phone ?? null,
              ubo_data: app.ubo_data ?? null,
              admin_notes: app.admin_notes ?? null,
            }}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-brand-navy text-base">
                Documents
              </CardTitle>
              <AdminDocumentUploader
                applicationId={params.id}
                requirements={(requirements ?? []) as DocumentRequirement[]}
                existingUploads={typedUploads}
              />
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {typedUploads.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span>{u.document_requirements?.name}</span>
                    <div className="flex items-center gap-3">
                      <VerificationBadge status={u.verification_status} />
                      <Link
                        href={`/admin/applications/${params.id}/documents/${u.id}`}
                        className="text-brand-blue text-xs hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </li>
                ))}
                {typedUploads.length === 0 && (
                  <li className="py-4 text-sm text-gray-400 text-center">
                    No documents uploaded yet
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>

          {/* AI Flagged Discrepancies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                AI Flagged Discrepancies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FlaggedDiscrepanciesCard
                applicationId={params.id}
                flaggedDocs={flaggedUploads.map((u) => ({
                  id: u.id,
                  application_id: u.application_id,
                  file_name: u.file_name,
                  verification_result: u.verification_result as VerificationResult | null,
                  document_requirements: u.document_requirements
                    ? { name: u.document_requirements.name, category: u.document_requirements.category }
                    : null,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Verification Checklist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {[
                  "Identity documents verified",
                  "Business registration confirmed",
                  "Source of funds reviewed",
                  "UBO declarations cross-checked",
                  "PEP/sanctions screening complete",
                  "Risk assessment completed",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm">
                    <div className="h-4 w-4 rounded border border-gray-300 bg-white flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-4">
                Checklist automation coming in v2
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right: Actions */}
        <div className="space-y-6">
          {/* Application Health Panel */}
          <ApplicationStatusPanel
            application={{
              business_name: app.business_name,
              status: app.status as ApplicationStatus,
              admin_notes: app.admin_notes,
            }}
            requirements={(requirements || []) as Array<{ id: string; name: string; category: string }>}
            uploads={typedUploads.map((u) => ({
              id: u.id,
              requirement_id: u.requirement_id,
              verification_status: u.verification_status,
              verification_result: u.verification_result,
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Stage Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StageSelector
                applicationId={params.id}
                currentStatus={app.status as ApplicationStatus}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Communication
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmailComposer
                applicationId={params.id}
                clientEmail={clientEmail}
                companyName={app.business_name || ""}
                previousEmails={(emailLog || []) as EmailLogEntry[]}
              />
            </CardContent>
          </Card>

          <AccountManagerPanel
            clientId={clientId}
            current={currentManager as unknown as (ClientAccountManager & { profiles: { full_name: string | null; email: string | null } | null }) | null}
            history={pastManagers as unknown as (ClientAccountManager & { profiles: { full_name: string | null; email: string | null } | null })[]}
            admins={(allAdmins || []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[]}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTrail
                entries={
                  (auditLog || []) as unknown as (AuditLogEntry & {
                    profiles?: { full_name: string | null };
                  })[]
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
