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
  // B-149 — service name (from B-144) surfaced under the ref in the
  // table + matched by the search input.
  name: string | null;
  status: string;
  service_template_id: string;
  service_template_name: string;
  created_at: string;
  updated_at: string;
  // B-149 — Assigned Officer column (parity with /admin/queue, B-130).
  assigned_admin_id: string | null;
  assigned_admin_name: string | null;
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

export type AdminOption = {
  id: string;
  name: string;
};

export default async function ServicesPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // B-149 — extended select to pick up service `name` (B-144),
  // `assigned_admin_id` + the joined admin user (B-130), and the
  // service_profile_removals soft-removal table (B-133) so we can
  // mirror the queue's filtering when deriving managers.
  const { data: rawServices } = await supabase
    .from("services")
    .select(`
      *,
      assigned_admin:users!services_assigned_admin_id_fkey(id, full_name, email),
      service_templates(id, name, description, service_fields),
      profile_service_roles(
        id, role, can_manage,
        client_profiles(id, full_name, email, is_representative,
          client_profile_kyc(*)
        )
      ),
      service_profile_removals(client_profile_id)
    `)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  // B-149 — admins list feeds the Assigned Officer dropdown in
  // ServicesPageClient. Same shape ServicesTable / queue uses.
  const { data: rawAdmins } = await supabase
    .from("admin_users")
    .select("user_id, users!inner(full_name, email)");
  const admins: AdminOption[] = (
    (rawAdmins as unknown as Array<{
      user_id: string;
      users: { full_name: string | null; email: string | null } | null;
    }> | null) ?? []
  ).map((a) => ({
    id: a.user_id,
    name: a.users?.full_name ?? a.users?.email ?? "Unnamed admin",
  }));

  const services = (rawServices ?? []) as unknown as Array<{
    id: string;
    service_number: string | null;
    name: string | null;
    status: string;
    service_template_id: string;
    service_details: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    assigned_admin_id: string | null;
    assigned_admin: { id: string; full_name: string | null; email: string | null } | null;
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
    service_profile_removals: Array<{ client_profile_id: string }> | null;
  }>;

  const serviceIds = services.map((s) => s.id);

  // Batch-fetch documents + audit_log "last updated by" in parallel.
  // B-132 — also pull profile-scoped personal docs (service_id IS NULL)
  // for any profile attached to one of these services. The per-service
  // bucket below adds them to whichever services the profile is on.
  const attachedProfileIds = Array.from(
    new Set(
      services
        .flatMap((s) => s.profile_service_roles ?? [])
        .map((r) => r.client_profiles?.id)
        .filter((v): v is string => !!v),
    ),
  );
  const [
    { data: allDocs },
    { data: personalDocs },
    { data: lastAuditRows },
  ] = await Promise.all([
    serviceIds.length > 0
      ? supabase
          .from("documents")
          .select("id, service_id, client_profile_id, verification_status")
          .in("service_id", serviceIds)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as { id: string; service_id: string | null; client_profile_id: string | null; verification_status: string }[] }),

    attachedProfileIds.length > 0
      ? supabase
          .from("documents")
          .select("id, service_id, client_profile_id, verification_status")
          .is("service_id", null)
          .eq("is_active", true)
          .in("client_profile_id", attachedProfileIds)
      : Promise.resolve({ data: [] as { id: string; service_id: string | null; client_profile_id: string | null; verification_status: string }[] }),

    serviceIds.length > 0
      ? supabase
          .from("audit_log")
          .select("entity_id, created_at, actor_name")
          .eq("entity_type", "service")
          .in("entity_id", serviceIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { entity_id: string; created_at: string; actor_name: string | null }[] }),
  ]);

  // Build map: serviceId → first (most recent) audit entry per service
  const auditByService = new Map<string, { by: string | null; at: string }>();
  for (const row of (lastAuditRows ?? []) as { entity_id: string; created_at: string; actor_name: string | null }[]) {
    if (!auditByService.has(row.entity_id)) {
      auditByService.set(row.entity_id, { by: row.actor_name, at: row.created_at });
    }
  }

  const docsByService = new Map<string, { verification_status: string }[]>();
  for (const doc of allDocs ?? []) {
    const d = doc as { id: string; service_id: string | null; client_profile_id: string | null; verification_status: string };
    if (!d.service_id) continue; // defensive: service-scoped query
    if (!docsByService.has(d.service_id)) docsByService.set(d.service_id, []);
    docsByService.get(d.service_id)!.push({ verification_status: d.verification_status });
  }

  // B-132 — for each personal doc, attribute it to every service the
  // owning profile is currently attached to. The same passport row may
  // appear in two services' progress counts; that matches the new
  // mental model ("Bruce's passport is satisfied on every service he
  // is on, courtesy of one upload").
  const personalDocsByProfile = new Map<string, { verification_status: string }[]>();
  for (const doc of personalDocs ?? []) {
    const d = doc as { id: string; client_profile_id: string | null; verification_status: string };
    if (!d.client_profile_id) continue;
    if (!personalDocsByProfile.has(d.client_profile_id))
      personalDocsByProfile.set(d.client_profile_id, []);
    personalDocsByProfile.get(d.client_profile_id)!.push({
      verification_status: d.verification_status,
    });
  }
  for (const svc of services) {
    const bucket = docsByService.get(svc.id) ?? [];
    const seen = new Set<string>();
    for (const r of svc.profile_service_roles ?? []) {
      const pid = r.client_profiles?.id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      const personal = personalDocsByProfile.get(pid) ?? [];
      if (personal.length === 0) continue;
      bucket.push(...personal);
    }
    if (bucket.length > 0) docsByService.set(svc.id, bucket);
  }

  // Build admin rows with pre-computed section percentages
  const rows: AdminServiceRow[] = services.map((svc) => {
    const fields = (svc.service_templates?.service_fields ?? []) as ServiceField[];
    const details = svc.service_details ?? {};
    const roles = svc.profile_service_roles ?? [];
    const docs = docsByService.get(svc.id) ?? [];

    // B-149 — respect B-133 soft removals when listing managers, so a
    // profile detached from a service no longer appears as a manager
    // here either (parity with the queue).
    const removedIds = new Set(
      (svc.service_profile_removals ?? []).map((r) => r.client_profile_id),
    );
    const activeRoles = roles.filter(
      (r) => r.client_profiles?.id && !removedIds.has(r.client_profiles.id),
    );

    const managers = activeRoles
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
      name: svc.name,
      status: svc.status,
      service_template_id: svc.service_template_id,
      service_template_name: svc.service_templates?.name ?? "Untitled",
      created_at: svc.created_at,
      updated_at: svc.updated_at,
      assigned_admin_id: svc.assigned_admin_id ?? null,
      assigned_admin_name: svc.assigned_admin?.full_name ?? null,
      managers: uniqueManagers,
      sectionPcts: {
        companySetup: companySetupPct,
        financial: financialPct,
        banking: bankingPct,
        peopleKyc: peopleKycPct,
        documents: documentsPct,
      },
      lastUpdatedAt: auditByService.get(svc.id)?.at ?? svc.updated_at,
      lastUpdatedBy: auditByService.get(svc.id)?.by ?? null,
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
      <ServicesPageClient
        rows={rows}
        templateOptions={templateOptions}
        admins={admins}
        currentUserId={session.user.id as string}
      />
    </div>
  );
}
