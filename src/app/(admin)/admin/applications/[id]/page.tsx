import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { StageSelector } from "@/components/admin/StageSelector";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { AccountManagerPanel } from "@/components/admin/AccountManagerPanel";
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
    // All admin users for the assignment dropdown
    supabase
      .from("admin_users")
      .select("user_id, profiles(full_name, email)")
      .order("created_at"),
  ]);

  if (!application) notFound();

  // Fetch account manager history for this client
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

  const app = application as Application & {
    clients?: { company_name: string | null };
    service_templates?: { name: string };
  };

  const clientEmail = app.contact_email || "";

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

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Application info */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Business name</span>
                <p className="font-medium">{app.business_name || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Type</span>
                <p>{app.business_type || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Country</span>
                <p>{app.business_country || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Address</span>
                <p>{app.business_address || "—"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Primary Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Name</span>
                <p>
                  {app.contact_name || "—"}
                </p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Email</span>
                <p>{clientEmail || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Phone</span>
                <p>{app.contact_phone || "—"}</p>
              </div>
            </CardContent>
          </Card>

          {app.ubo_data && app.ubo_data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-brand-navy text-base">
                  Ultimate Beneficial Owners
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {app.ubo_data.map((ubo, idx) => (
                  <div
                    key={idx}
                    className="rounded border bg-gray-50 p-3 text-sm"
                  >
                    <p className="font-medium">{ubo.full_name}</p>
                    <p className="text-gray-500">
                      {ubo.nationality} · {ubo.ownership_percentage}% · DOB:{" "}
                      {ubo.date_of_birth} · Passport: {ubo.passport_number}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(uploads || []).map((upload) => {
                  const u = upload as DocumentUpload & {
                    document_requirements?: DocumentRequirement;
                  };
                  return (
                    <li
                      key={u.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span>{u.document_requirements?.name}</span>
                      <div className="flex items-center gap-3">
                        <VerificationBadge
                          status={u.verification_status}
                        />
                        <Link
                          href={`/admin/applications/${params.id}/documents/${u.id}`}
                          className="text-brand-blue text-xs hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </li>
                  );
                })}
                {(!uploads || uploads.length === 0) && (
                  <li className="py-4 text-sm text-gray-400 text-center">
                    No documents uploaded yet
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right: Actions */}
        <div className="space-y-6">
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
