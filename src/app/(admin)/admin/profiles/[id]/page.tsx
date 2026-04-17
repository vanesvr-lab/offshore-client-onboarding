import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ProfileDetailClient } from "./ProfileDetailClient";
import type { ClientProfile, ClientProfileKyc, ProfileServiceRole, DocumentRecord, DueDiligenceRequirement, RoleDocumentRequirement, ProfileRequirementOverride } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const { id } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Fetch profile + KYC + roles + documents in parallel
  const [profileRes, kycRes, rolesRes, docsRes] = await Promise.all([
    supabase
      .from("client_profiles")
      .select("*, users(email, is_active)")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single(),
    supabase
      .from("client_profile_kyc")
      .select("*")
      .eq("client_profile_id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("profile_service_roles")
      .select("*, services(id, status, service_details, service_templates(name))")
      .eq("client_profile_id", id)
      .eq("tenant_id", tenantId),
    supabase
      .from("documents")
      .select("*, document_types(name, category)")
      .eq("client_profile_id", id)
      .eq("is_active", true),
  ]);

  if (!profileRes.data) notFound();

  const profile = profileRes.data as unknown as ClientProfile;
  const ddLevel = profile.due_diligence_level ?? "cdd";

  // Cumulative DD levels: edd includes sdd+cdd+edd
  const cumulativeLevels: Record<string, string[]> = {
    sdd: ["basic", "sdd"],
    cdd: ["basic", "sdd", "cdd"],
    edd: ["basic", "sdd", "cdd", "edd"],
  };
  const levelsForProfile = cumulativeLevels[ddLevel] ?? ["basic", "sdd", "cdd"];

  // Roles this profile has across services
  const profileRoles = (rolesRes.data ?? []).map((r) => r.role as string);
  const uniqueRoles = profileRoles.filter((role, idx) => profileRoles.indexOf(role) === idx);

  // Fetch DD requirements + role doc requirements + overrides in parallel
  const [ddReqsRes, roleReqsRes, overridesRes] = await Promise.all([
    supabase
      .from("due_diligence_requirements")
      .select("*, document_types(id, name)")
      .in("level", levelsForProfile)
      .order("sort_order"),
    uniqueRoles.length > 0
      ? supabase
          .from("role_document_requirements")
          .select("*, document_types(id, name)")
          .in("role", uniqueRoles)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    supabase
      .from("profile_requirement_overrides")
      .select("*")
      .eq("client_profile_id", id),
  ]);

  return (
    <ProfileDetailClient
      profile={profile}
      kyc={(kycRes.data ?? null) as unknown as ClientProfileKyc | null}
      roles={(rolesRes.data ?? []) as unknown as ProfileServiceRole[]}
      documents={(docsRes.data ?? []) as unknown as DocumentRecord[]}
      ddRequirements={(ddReqsRes.data ?? []) as unknown as DueDiligenceRequirement[]}
      roleRequirements={(roleReqsRes.data ?? []) as unknown as RoleDocumentRequirement[]}
      requirementOverrides={(overridesRes.data ?? []) as unknown as ProfileRequirementOverride[]}
    />
  );
}
