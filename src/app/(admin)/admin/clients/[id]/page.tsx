import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AccountManagerPanel } from "@/components/admin/AccountManagerPanel";
import { ClientEditForm } from "@/components/admin/ClientEditForm";
import { SendInvitePanel } from "@/components/admin/SendInvitePanel";
import { formatDate } from "@/lib/utils/formatters";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import type { ClientAccountManager, ApplicationStatus } from "@/types";

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createAdminClient();

  const [
    { data: client },
    { data: allAdmins },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(`
        id, company_name, created_at, updated_at, invite_sent_at,
        client_users(
          id, role, created_at,
          profiles!client_users_user_id_fkey(id, full_name, email, phone)
        ),
        applications(
          id, status, business_name, submitted_at, created_at,
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
  ]);

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
        <h1 className="text-2xl font-bold text-brand-navy">{client.company_name}</h1>
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

          {/* Applications */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base text-brand-navy">Applications</CardTitle>
              <Link href={`/admin/clients/${client.id}/apply`}>
                <Button size="sm" className="bg-brand-navy hover:bg-brand-blue gap-1.5">
                  <PlusCircle className="h-3.5 w-3.5" />
                  Start application
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {applications.length === 0 ? (
                <p className="text-sm text-gray-400">No applications yet.</p>
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
                          {app.business_name || "Untitled"}
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
        </div>

        {/* Right: account manager + invite */}
        <div className="space-y-4">
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
        </div>
      </div>
    </div>
  );
}
