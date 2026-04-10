import { createAdminClient } from "@/lib/supabase/admin";
import { ApplicationsTable } from "@/components/admin/ApplicationsTable";
import type { ApplicationRow } from "@/components/admin/ApplicationsTable";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const supabase = createAdminClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("id, business_name, reference_number, status, admin_notes, created_at, updated_at, clients(company_name), service_templates(name)")
    .order("updated_at", { ascending: false });

  const rows: ApplicationRow[] = (applications || []).map((a) => ({
    id: a.id,
    business_name: a.business_name,
    reference_number: a.reference_number ?? null,
    status: a.status,
    admin_notes: a.admin_notes,
    created_at: a.created_at,
    updated_at: a.updated_at,
    companyName: (a.clients as unknown as { company_name: string | null } | null)?.company_name ?? null,
    serviceName: (a.service_templates as unknown as { name: string } | null)?.name ?? null,
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Solutions & Services</h1>
        <p className="text-gray-500 mt-1">All applications across all clients</p>
      </div>
      <ApplicationsTable applications={rows} />
    </div>
  );
}
