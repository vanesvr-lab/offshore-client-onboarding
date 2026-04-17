import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { DashboardClient } from "@/components/client/DashboardClient";
import {
  calcSectionCompletion,
  calcKycCompletion,
} from "@/lib/utils/serviceCompletion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

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
        service_id, role,
        client_profiles(id, client_profile_kyc(*))
      `)
      .in("service_id", serviceIds)
      .eq("tenant_id", tenantId),
    supabase
      .from("documents")
      .select("id, service_id, verification_status")
      .in("service_id", serviceIds)
      .eq("is_active", true),
  ]);

  type PersonRow = {
    service_id: string;
    role: string;
    client_profiles: { id: string; client_profile_kyc: Record<string, unknown> | null } | null;
  };

  type DocRow = { service_id: string; verification_status: string };

  const personsByService = new Map<string, PersonRow[]>();
  for (const row of (personsRes.data ?? []) as unknown as PersonRow[]) {
    if (!personsByService.has(row.service_id)) personsByService.set(row.service_id, []);
    personsByService.get(row.service_id)!.push(row);
  }

  const docsByService = new Map<string, DocRow[]>();
  for (const doc of (docsRes.data ?? []) as unknown as DocRow[]) {
    if (!docsByService.has(doc.service_id)) docsByService.set(doc.service_id, []);
    docsByService.get(doc.service_id)!.push(doc);
  }

  // Build service card rows with section completions
  const serviceCards = services.map((svc) => {
    const fields = (svc.service_templates?.service_fields ?? []) as ServiceField[];
    const details = svc.service_details ?? {};
    const persons = personsByService.get(svc.id) ?? [];
    const docs = docsByService.get(svc.id) ?? [];

    const csComplete = calcSectionCompletion(fields, details, "company_setup").percentage >= 100;
    const fiComplete = calcSectionCompletion(fields, details, "financial").percentage >= 100;
    const baComplete = calcSectionCompletion(fields, details, "banking").percentage >= 100;

    const hasDirector = persons.some((p) => p.role === "director");
    const kycPersons = persons.map((p) => ({
      client_profiles: p.client_profiles
        ? { client_profile_kyc: p.client_profiles.client_profile_kyc }
        : null,
    }));
    const kycComplete =
      hasDirector && calcKycCompletion(kycPersons).percentage >= 100;

    const docsComplete = docs.length > 0;

    const sections = [
      { label: "Company Setup", complete: csComplete, wizardStep: 0 },
      { label: "Financial", complete: fiComplete, wizardStep: 1 },
      { label: "Banking", complete: baComplete, wizardStep: 2 },
      { label: "People & KYC", complete: kycComplete, wizardStep: 3 },
      { label: "Documents", complete: docsComplete, wizardStep: 4 },
    ];

    const completedCount = sections.filter((s) => s.complete).length;
    const overallPct = Math.round((completedCount / sections.length) * 100);

    return {
      id: svc.id,
      status: svc.status,
      service_templates: svc.service_templates
        ? { name: svc.service_templates.name, description: svc.service_templates.description }
        : null,
      overallPct,
      sections,
    };
  });

  const allComplete = serviceCards.every((s) => s.overallPct === 100);
  const userName = session.user.name ?? session.user.email ?? "there";

  return (
    <DashboardClient
      userName={userName}
      services={serviceCards}
      allComplete={allComplete}
    />
  );
}
