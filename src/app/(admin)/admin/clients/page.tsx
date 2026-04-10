import { createAdminClient } from "@/lib/supabase/admin";
import { ClientsTable } from "@/components/admin/ClientsTable";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import type { ClientRow } from "@/components/admin/ClientsTable";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = createAdminClient();

  const [{ data: clients }, { data: appCounts }] = await Promise.all([
    supabase
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
          ended_at,
          profiles!admin_id(full_name)
        )
      `)
      .order("created_at", { ascending: false }),
    supabase.from("applications").select("client_id"),
  ]);

  const countMap: Record<string, number> = {};
  (appCounts || []).forEach((a) => {
    countMap[a.client_id] = (countMap[a.client_id] || 0) + 1;
  });

  const clientRows: ClientRow[] = (clients || []).map((client) => {
    const users = client.client_users as unknown as {
      role: string;
      profiles: { full_name: string | null; email: string | null } | null;
    }[];
    const owner = users?.find((u) => u.role === "owner");
    const activeManager = (
      client.client_account_managers as unknown as {
        ended_at: string | null;
        profiles: { full_name: string | null } | null;
      }[]
    )?.find((m) => !m.ended_at);

    return {
      id: client.id,
      company_name: client.company_name,
      created_at: client.created_at,
      ownerName: owner?.profiles?.full_name ?? null,
      ownerEmail: owner?.profiles?.email ?? null,
      managerName: activeManager?.profiles?.full_name ?? null,
      appCount: countMap[client.id] ?? 0,
    };
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Clients</h1>
          <p className="text-gray-500 mt-1">All registered client companies</p>
        </div>
        <Link href="/admin/clients/new">
          <Button className="bg-brand-navy hover:bg-brand-blue gap-1.5">
            <PlusCircle className="h-4 w-4" />
            New Client
          </Button>
        </Link>
      </div>
      <ClientsTable clients={clientRows} />
    </div>
  );
}
