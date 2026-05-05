import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/**
 * /kyc-review — server-side redirect that picks the right destination at
 * request time and 302s the user there.
 *
 * Why a route exists at all (rather than the sidebar linking directly to
 * `/services/<id>?wizardStep=3`): the sidebar renders before the layout
 * has resolved which service the client is currently working on, so it
 * can't bake a service id into the href. This route runs server-side at
 * click time, picks the most recent non-deleted service the user can
 * manage, and redirects to its People & KYC view.
 *
 * B-056 §2 — replaces the older `/kyc` (`KycPageClient`) hub from the
 * primary client's sidebar. `/kyc` itself is left mounted as a fallback
 * route until Vercel analytics confirms it's unused (tech debt #22).
 */
export const dynamic = "force-dynamic";

export default async function KycReviewRedirect() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");

  const tenantId = getTenantId(session);
  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) redirect("/dashboard");

  const supabase = createAdminClient();
  // Most recent non-deleted service this profile can manage. The
  // `services!inner` join filters on `is_deleted=false` server-side so we
  // never have to discard rows after the round-trip.
  const { data } = await supabase
    .from("profile_service_roles")
    .select("service_id, services!inner(id, created_at, is_deleted)")
    .eq("tenant_id", tenantId)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("services.is_deleted", false)
    .order("services(created_at)", { ascending: false })
    .limit(1)
    .maybeSingle();

  const serviceId = (data as { service_id?: string } | null)?.service_id;
  if (!serviceId) redirect("/apply");

  // People & KYC is stepIndex 3 in SECTION_CONFIG (see
  // ClientServiceDetailClient.tsx). The page already reads `wizardStep`
  // from `searchParams` and auto-opens the wizard at that step.
  redirect(`/services/${serviceId}?wizardStep=3`);
}
