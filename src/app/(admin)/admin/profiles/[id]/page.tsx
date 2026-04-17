import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { ProfileDetailClient } from "./ProfileDetailClient";
import type { ClientProfile, ClientProfileKyc, ProfileServiceRole, DocumentRecord } from "@/types";

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

  return (
    <ProfileDetailClient
      profile={profileRes.data as unknown as ClientProfile}
      kyc={(kycRes.data ?? null) as unknown as ClientProfileKyc | null}
      roles={(rolesRes.data ?? []) as unknown as ProfileServiceRole[]}
      documents={(docsRes.data ?? []) as unknown as DocumentRecord[]}
    />
  );
}
