import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@/lib/auth";
import { getTenantId } from "@/lib/tenant";
import { ServicesTable, type ServiceRow } from "@/components/admin/ServicesTable";
import { CreateClientModal } from "@/components/admin/CreateClientModal";

export const dynamic = "force-dynamic";

interface RawServiceRow {
  id: string;
  service_number: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  assigned_admin_id: string | null;
  assigned_admin: { id: string; full_name: string | null; email: string | null } | null;
  service_templates: { name: string } | null;
  profile_service_roles: Array<{
    can_manage: boolean | null;
    client_profiles: { id: string; full_name: string | null; email: string | null } | null;
  }> | null;
}

export default async function QueuePage() {
  const session = await auth();
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: rawServices } = await supabase
    .from("services")
    .select(
      `
      id,
      service_number,
      status,
      service_details,
      created_at,
      updated_at,
      assigned_admin_id,
      assigned_admin:users!services_assigned_admin_id_fkey(id, full_name, email),
      service_templates(name),
      profile_service_roles(
        can_manage,
        client_profiles(id, full_name, email)
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .neq("status", "draft")
    .order("updated_at", { ascending: false });

  const services: ServiceRow[] = (rawServices as unknown as RawServiceRow[] | null ?? []).map((s) => {
    const roles = s.profile_service_roles ?? [];
    const primary =
      roles.find((r) => r.can_manage)?.client_profiles ??
      roles[0]?.client_profiles ??
      null;
    return {
      id: s.id,
      service_number: s.service_number,
      status: s.status,
      created_at: s.created_at,
      updated_at: s.updated_at,
      assigned_admin_id: s.assigned_admin_id,
      assigned_admin_name: s.assigned_admin?.full_name ?? null,
      template_name: s.service_templates?.name ?? null,
      primary_profile_name: primary?.full_name ?? null,
    };
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Review Queue</h1>
          <p className="text-gray-500 mt-1">
            Active services awaiting review
          </p>
        </div>
        <CreateClientModal />
      </div>
      <ServicesTable services={services} />
    </div>
  );
}
