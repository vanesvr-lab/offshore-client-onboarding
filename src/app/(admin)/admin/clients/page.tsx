import { createAdminClient } from "@/lib/supabase/admin";
import { CreateClientModal } from "@/components/admin/CreateClientModal";
import { formatDate } from "@/lib/utils/formatters";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = createAdminClient();

  const { data: clients } = await supabase
    .from("clients")
    .select(`
      id,
      company_name,
      created_at,
      client_users(
        role,
        profiles!client_users_user_id_fkey(full_name, email)
      ),
      client_account_managers(
        admin_id,
        started_at,
        ended_at,
        profiles!admin_id(full_name)
      )
    `)
    .order("created_at", { ascending: false });

  // Count applications per client
  const { data: appCounts } = await supabase
    .from("applications")
    .select("client_id");

  const countMap: Record<string, number> = {};
  (appCounts || []).forEach((a) => {
    countMap[a.client_id] = (countMap[a.client_id] || 0) + 1;
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Clients</h1>
          <p className="text-gray-500 mt-1">All registered client companies</p>
        </div>
        <CreateClientModal />
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Company</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Primary Contact</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Account Manager</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Applications</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {!clients || clients.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No clients yet
                </td>
              </tr>
            ) : (
              clients.map((client) => {
                const users = client.client_users as unknown as {
                  role: string;
                  profiles: { full_name: string | null; email: string | null } | null;
                }[];
                const owner = users?.find((u) => u.role === "owner");
                const activeManager = (client.client_account_managers as unknown as {
                  ended_at: string | null;
                  profiles: { full_name: string | null } | null;
                }[])?.find((m) => !m.ended_at);

                return (
                  <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-brand-navy">
                      {client.company_name}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-700">{owner?.profiles?.full_name || "—"}</p>
                      <p className="text-xs text-gray-400">{owner?.profiles?.email || ""}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {activeManager?.profiles?.full_name || (
                        <span className="text-gray-300">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {countMap[client.id] || 0}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(client.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/clients/${client.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
