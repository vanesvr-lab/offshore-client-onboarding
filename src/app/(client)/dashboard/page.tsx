import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { DashboardClient } from "@/components/client/DashboardClient";
import { computePendingActions } from "@/lib/utils/pendingActions";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type ManagedService = {
  id: string;
  status: string;
  service_details: Record<string, unknown>;
  service_templates: {
    name: string;
    description: string | null;
    service_fields: unknown[] | null;
  } | null;
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const clientProfileId = session.user.clientProfileId;

  if (!clientProfileId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-3">
        <p className="text-lg font-semibold text-brand-navy">Getting your account ready</p>
        <p className="text-sm text-gray-500">
          Your profile is being set up. Please check back shortly or contact your account manager.
        </p>
        <Link href="/kyc">
          <Button variant="outline">Complete your KYC</Button>
        </Link>
      </div>
    );
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Fetch managed services for this profile
  const { data: roleRows } = await supabase
    .from("profile_service_roles")
    .select(`
      service_id,
      services(
        id, status, service_details,
        service_templates(name, description, service_fields)
      )
    `)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("tenant_id", tenantId);

  // Deduplicate services
  const seen = new Set<string>();
  const services: ManagedService[] = [];
  for (const row of roleRows ?? []) {
    const svc = (row.services as unknown) as ManagedService | null;
    if (svc && !seen.has(svc.id)) {
      seen.add(svc.id);
      services.push(svc);
    }
  }

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center space-y-3">
        <p className="text-lg font-semibold text-brand-navy">No services yet</p>
        <p className="text-sm text-gray-500">
          Your account manager will link services to your profile shortly.
        </p>
      </div>
    );
  }

  const serviceIds = services.map((s) => s.id);

  // Batch-fetch persons and documents for all services
  const [personsRes, docsRes] = await Promise.all([
    supabase
      .from("profile_service_roles")
      .select(`
        service_id, role, shareholding_percentage,
        client_profiles(id, full_name, due_diligence_level, client_profile_kyc(*))
      `)
      .in("service_id", serviceIds)
      .eq("tenant_id", tenantId),
    supabase
      .from("documents")
      .select("id, service_id, verification_status")
      .in("service_id", serviceIds)
      .eq("is_active", true),
  ]);

  const personsByService = new Map<string, typeof personsRes.data>();
  for (const row of personsRes.data ?? []) {
    const sid = (row as { service_id: string }).service_id;
    if (!personsByService.has(sid)) personsByService.set(sid, []);
    personsByService.get(sid)!.push(row);
  }

  const docsByService = new Map<string, typeof docsRes.data>();
  for (const doc of docsRes.data ?? []) {
    const sid = (doc as { service_id: string }).service_id;
    if (!docsByService.has(sid)) docsByService.set(sid, []);
    docsByService.get(sid)!.push(doc);
  }

  // Compute pending actions per service
  const allPendingActions = services.flatMap((svc) => {
    const personsForService = personsByService.get(svc.id) ?? [];
    const docsForService = docsByService.get(svc.id) ?? [];
    return computePendingActions(
      svc as unknown as Parameters<typeof computePendingActions>[0],
      personsForService as unknown as Parameters<typeof computePendingActions>[1],
      docsForService as unknown as Parameters<typeof computePendingActions>[2]
    );
  });

  const allComplete = allPendingActions.length === 0;
  const userName = session.user.name ?? session.user.email ?? "there";

  const dashboardServices = services.map((svc) => ({
    id: svc.id,
    status: svc.status,
    service_templates: svc.service_templates
      ? { name: svc.service_templates.name, description: svc.service_templates.description }
      : null,
  }));

  return (
    <DashboardClient
      userName={userName}
      services={dashboardServices}
      pendingActions={allPendingActions}
      allComplete={allComplete}
    />
  );
}
