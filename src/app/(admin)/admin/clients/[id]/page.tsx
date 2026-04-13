import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AccountManagerPanel } from "@/components/admin/AccountManagerPanel";
import { ClientEditForm } from "@/components/admin/ClientEditForm";
import { SendInvitePanel } from "@/components/admin/SendInvitePanel";
import { WorkflowMilestonesCard } from "@/components/admin/WorkflowMilestonesCard";
import { ComplianceScorecard } from "@/components/admin/ComplianceScorecard";
import { ProcessLauncher } from "@/components/admin/ProcessLauncher";
import { formatDate } from "@/lib/utils/formatters";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { AddBlankApplication } from "@/components/admin/AddBlankApplication";
import { DeleteClientButton } from "@/components/admin/DeleteClientButton";
import { ClientAuditTrailButton } from "@/components/admin/ClientAuditTrailButton";
import type { ClientAccountManager, ApplicationStatus, KycRecord, DocumentRecord, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createAdminClient();

  const [
    { data: client },
    { data: allAdmins },
    { data: kycRecords },
    { data: processes },
    { data: documents },
    { data: allRequirements },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(`
        id, company_name, created_at, updated_at, invite_sent_at,
        client_type, loe_sent_at, invoice_sent_at, payment_received_at,
        portal_link_sent_at, kyc_completed_at, application_submitted_at,
        due_diligence_level,
        client_users(
          id, role, created_at,
          profiles!client_users_user_id_fkey(id, full_name, email, phone)
        ),
        applications(
          id, status, business_name, reference_number, submitted_at, created_at,
          service_templates(name)
        ),
        client_account_managers(
          id, client_id, admin_id, started_at, ended_at, notes, assigned_by, created_at,
          profiles!admin_id(full_name, email)
        )
      `)
      .eq("id", params.id)
      .single(),
    supabase
      .from("admin_users")
      .select("user_id, profiles(full_name, email)")
      .order("created_at"),
    supabase
      .from("kyc_records")
      .select("*")
      .eq("client_id", params.id)
      .order("created_at"),
    supabase
      .from("client_processes")
      .select(`
        id, status, started_at, notes,
        process_templates(name),
        process_documents(id, status)
      `)
      .eq("client_id", params.id)
      .order("started_at", { ascending: false }),
    supabase
      .from("documents")
      .select("*")
      .eq("client_id", params.id)
      .eq("is_active", true),
    supabase
      .from("due_diligence_requirements")
      .select("*, document_types(id, name)")
      .order("sort_order"),
  ]);

  // Fetch service templates for "Add Application" dropdown
  const { data: serviceTemplates } = await supabase
    .from("service_templates")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (!client) notFound();

  const users = client.client_users as unknown as {
    id: string;
    role: string;
    created_at: string;
    profiles: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  }[];

  const applications = client.applications as unknown as {
    id: string;
    status: string;
    business_name: string | null;
    reference_number: string | null;
    submitted_at: string | null;
    created_at: string;
    service_templates: { name: string } | null;
  }[];

  const managerHistory = client.client_account_managers as unknown as (ClientAccountManager & {
    profiles: { full_name: string | null; email: string | null } | null;
  })[];
  const currentManager = managerHistory.find((m) => !m.ended_at) ?? null;
  const pastManagers = managerHistory.filter((m) => m.ended_at !== null);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/clients" className="text-sm text-brand-blue hover:underline mb-2 block">
          ← Back to Clients
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-brand-navy">{client.company_name}</h1>
          <ProcessLauncher
            clientId={client.id}
            clientType={(client as unknown as { client_type: "individual" | "organisation" | null }).client_type}
          />
          <ClientAuditTrailButton clientId={client.id} clientName={client.company_name} />
        </div>
        <p className="text-gray-500 text-sm mt-1">Client since {formatDate(client.created_at)}</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: main info */}
        <div className="col-span-2 space-y-6">

          {/* Editable company details */}
          <ClientEditForm clientId={client.id} companyName={client.company_name} />

          {/* Users on this account */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy">Account Users</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-gray-500 font-medium">Name</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Email</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Role</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 text-gray-700">{u.profiles?.full_name || "—"}</td>
                      <td className="py-2 text-gray-500">{u.profiles?.email || "—"}</td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                          u.role === "owner"
                            ? "bg-brand-navy/10 text-brand-navy"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2 text-gray-400">{formatDate(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Compliance Scorecard */}
          <ComplianceScorecard
            clientId={client.id}
            kycRecords={(kycRecords ?? []) as KycRecord[]}
            documents={(documents ?? []) as unknown as DocumentRecord[]}
            dueDiligenceLevel={((client as unknown as Record<string, unknown>).due_diligence_level as DueDiligenceLevel) ?? "cdd"}
            requirements={(allRequirements ?? []) as unknown as DueDiligenceRequirement[]}
          />

          {/* Applications */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base text-brand-navy">Solutions & Services</CardTitle>
              <div className="flex items-center gap-2">
                <AddBlankApplication
                  clientId={client.id}
                  templates={(serviceTemplates ?? []) as { id: string; name: string }[]}
                />
                <Link href={`/admin/clients/${client.id}/apply`}>
                  <Button size="sm" className="bg-brand-navy hover:bg-brand-blue gap-1.5">
                    <PlusCircle className="h-3.5 w-3.5" />
                    Start Solution
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {applications.length === 0 ? (
                <p className="text-sm text-gray-400">No solutions yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-gray-500 font-medium">Application</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Service</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Submitted</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {applications.map((app) => (
                      <tr key={app.id}>
                        <td className="py-2 font-medium text-brand-navy">
                          {app.reference_number || app.business_name || "Draft"}
                        </td>
                        <td className="py-2 text-gray-500">
                          {app.service_templates?.name || "—"}
                        </td>
                        <td className="py-2">
                          <StatusBadge status={app.status as ApplicationStatus} />
                        </td>
                        <td className="py-2 text-gray-400">
                          {app.submitted_at ? formatDate(app.submitted_at) : "Draft"}
                        </td>
                        <td className="py-2">
                          <Link href={`/admin/applications/${app.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Active Processes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy">Active Processes</CardTitle>
            </CardHeader>
            <CardContent>
              {(processes ?? []).length === 0 ? (
                <p className="text-sm text-gray-400">No active processes.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 text-gray-500 font-medium">Process</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Status</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Documents</th>
                      <th className="text-left py-2 text-gray-500 font-medium">Started</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(processes ?? []).map((proc) => {
                      const pt = proc.process_templates as unknown as { name?: string } | null;
                      const docs = proc.process_documents as unknown as { id: string; status: string }[];
                      const available = docs.filter((d) => d.status === "available" || d.status === "received").length;
                      return (
                        <tr key={proc.id}>
                          <td className="py-2 font-medium text-brand-navy">{pt?.name ?? "Unnamed"}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                              proc.status === "complete" ? "bg-green-100 text-green-800"
                              : proc.status === "ready" ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-600"
                            }`}>{proc.status}</span>
                          </td>
                          <td className="py-2 text-gray-500">{available}/{docs.length}</td>
                          <td className="py-2 text-gray-400">{formatDate(proc.started_at)}</td>
                          <td className="py-2">
                            <Link href={`/admin/clients/${client.id}/processes/${proc.id}`}>
                              <Button variant="outline" size="sm">View</Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: workflow + account manager + invite */}
        <div className="space-y-4">
          <WorkflowMilestonesCard
            clientId={client.id}
            milestones={{
              loe_sent_at: (client as unknown as Record<string, string | null>).loe_sent_at ?? null,
              invoice_sent_at: (client as unknown as Record<string, string | null>).invoice_sent_at ?? null,
              payment_received_at: (client as unknown as Record<string, string | null>).payment_received_at ?? null,
              portal_link_sent_at: (client as unknown as Record<string, string | null>).portal_link_sent_at ?? null,
              kyc_completed_at: (client as unknown as Record<string, string | null>).kyc_completed_at ?? null,
              application_submitted_at: (client as unknown as Record<string, string | null>).application_submitted_at ?? null,
            }}
          />
          <AccountManagerPanel
            clientId={client.id}
            current={currentManager as unknown as (ClientAccountManager & { profiles: { full_name: string | null; email: string | null } | null }) | null}
            history={pastManagers as unknown as (ClientAccountManager & { profiles: { full_name: string | null; email: string | null } | null })[]}
            admins={(allAdmins || []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[]}
          />
          <SendInvitePanel
            clientId={client.id}
            inviteSentAt={(client as unknown as { invite_sent_at: string | null }).invite_sent_at}
          />

          {/* Danger zone */}
          <div className="rounded-lg border border-red-100 p-4">
            <p className="text-sm font-medium text-red-700 mb-2">Danger Zone</p>
            <p className="text-xs text-gray-500 mb-3">
              Permanently hides this client and disables their login. Cannot be undone.
            </p>
            <DeleteClientButton
              clientId={client.id}
              clientName={client.company_name}
              contactName={users[0]?.profiles?.full_name ?? null}
              contactEmail={users[0]?.profiles?.email ?? null}
              applicationCount={applications.length}
              documentCount={0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
