import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ServicesPageClient } from "./ServicesPageClient";
import {
  calcSectionCompletion,
  calcKycCompletion,
  calcDocumentsCompletion,
} from "@/lib/utils/serviceCompletion";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export const dynamic = "force-dynamic";

export type AdminServiceRow = {
  id: string;
  service_number: string | null;
  status: string;
  service_template_id: string;
  service_template_name: string;
  created_at: string;
  updated_at: string;
  managers: { id: string; full_name: string }[];
  sectionPcts: {
    companySetup: number;
    financial: number;
    banking: number;
    peopleKyc: number;
    documents: number;
  };
  lastUpdatedAt: string;
  lastUpdatedBy: string | null;
};

export default async function ServicesPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: rawServices } = await supabase
    .from("services")
    .select(`
      *,
      service_templates(id, name, description, service_fields),
      profile_service_roles(
        id, role, can_manage,
        client_profiles(id, full_name, email, is_representative,
          client_profile_kyc(*)
        )
      )
    `)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  const services = (rawServices ?? []) as unknown as Array<{
    id: string;
    service_number: string | null;
    status: string;
    service_template_id: string;
    service_details: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    service_templates: {
      id: string;
      name: string;
      description: string | null;
      service_fields: ServiceField[] | null;
    } | null;
    profile_service_roles: Array<{
      id: string;
      role: string;
      can_manage: boolean;
      client_profiles: {
        id: string;
        full_name: string;
        email: string | null;
        is_representative: boolean;
        client_profile_kyc: Record<string, unknown> | null;
      } | null;
    }>;
  }>;

  // Batch-fetch documents for all services
  const serviceIds = services.map((s) => s.id);
  const { data: allDocs } = serviceIds.length > 0
    ? await supabase
        .from("documents")
        .select("id, service_id, verification_status")
        .in("service_id", serviceIds)
        .eq("is_active", true)
    : { data: [] };

  const docsByService = new Map<string, { verification_status: string }[]>();
  for (const doc of allDocs ?? []) {
    const d = doc as { id: string; service_id: string; verification_status: string };
    if (!docsByService.has(d.service_id)) docsByService.set(d.service_id, []);
    docsByService.get(d.service_id)!.push({ verification_status: d.verification_status });
  }

  // Build admin rows with pre-computed section percentages
  const rows: AdminServiceRow[] = services.map((svc) => {
    const fields = (svc.service_templates?.service_fields ?? []) as ServiceField[];
    const details = svc.service_details ?? {};
    const roles = svc.profile_service_roles ?? [];
    const docs = docsByService.get(svc.id) ?? [];

    const managers = roles
      .filter((r) => r.can_manage && r.client_profiles)
      .map((r) => ({ id: r.client_profiles!.id, full_name: r.client_profiles!.full_name }));

    // Remove duplicate manager entries (same profile can have multiple roles)
    const uniqueManagers = Array.from(
      new Map(managers.map((m) => [m.id, m])).values()
    );

    // Section completions
    const companySetupPct = calcSectionCompletion(fields, details, "company_setup").percentage;
    const financialPct = calcSectionCompletion(fields, details, "financial").percentage;
    const bankingPct = calcSectionCompletion(fields, details, "banking").percentage;

    // People & KYC: combine people presence + KYC completeness
    const hasDirector = roles.some((r) => r.role === "director");
    const kycPersons = roles.map((r) => ({ client_profiles: r.client_profiles ? { client_profile_kyc: r.client_profiles.client_profile_kyc } : null }));
    const kycPct = hasDirector ? calcKycCompletion(kycPersons).percentage : 0;
    const peopleKycPct = roles.length === 0 ? 0 : hasDirector ? kycPct : Math.round(kycPct * 0.5);

    const documentsPct = calcDocumentsCompletion(docs).percentage;

    return {
      id: svc.id,
      service_number: svc.service_number,
      status: svc.status,
      service_template_id: svc.service_template_id,
      service_template_name: svc.service_templates?.name ?? "Untitled",
      created_at: svc.created_at,
      updated_at: svc.updated_at,
      managers: uniqueManagers,
      sectionPcts: {
        companySetup: companySetupPct,
        financial: financialPct,
        banking: bankingPct,
        peopleKyc: peopleKycPct,
        documents: documentsPct,
      },
      lastUpdatedAt: svc.updated_at,
      lastUpdatedBy: null, // TODO: pull from audit_log when it tracks service changes
    };
  });

  // Collect distinct service templates for the filter bar
  const templateOptions = Array.from(
    new Map(
      services
        .filter((s) => s.service_templates)
        .map((s) => [
          s.service_template_id,
          { id: s.service_template_id, name: s.service_templates!.name },
        ])
    ).values()
  );

  return (
    <div>
      <ServicesPageClient rows={rows} templateOptions={templateOptions} />
    </div>
  );
}
