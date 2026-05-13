// B-108 Batch 1 — service-id resolvers for the communications log.
//
// The `service_communications` table requires a non-null `service_id`,
// but several email endpoints operate on clients / profiles / processes
// and don't carry one directly. These helpers walk the schema to find
// the matching service ids:
//
//   client_id → client_users.user_id → client_profiles.user_id
//             → profile_service_roles.service_id
//
//   client_profile_id → profile_service_roles.service_id
//
// Return `string[]` so the caller can loop and log one row per service.
// Empty array is fine — best-effort logging.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function findServiceIdsForClient(
  supabase: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<string[]> {
  // 1) client → user ids via client_users
  const { data: cuRows } = await supabase
    .from("client_users")
    .select("user_id")
    .eq("client_id", clientId);
  const userIds = (cuRows ?? [])
    .map((r) => (r as { user_id: string | null }).user_id)
    .filter((v): v is string => !!v);
  if (userIds.length === 0) return [];

  // 2) user ids → client_profile ids
  const { data: cpRows } = await supabase
    .from("client_profiles")
    .select("id")
    .in("user_id", userIds)
    .eq("tenant_id", tenantId);
  const profileIds = (cpRows ?? [])
    .map((r) => (r as { id: string }).id)
    .filter((v): v is string => !!v);
  if (profileIds.length === 0) return [];

  return findServiceIdsForProfiles(supabase, profileIds, tenantId);
}

export async function findServiceIdsForProfile(
  supabase: SupabaseClient,
  clientProfileId: string,
  tenantId: string,
): Promise<string[]> {
  return findServiceIdsForProfiles(supabase, [clientProfileId], tenantId);
}

async function findServiceIdsForProfiles(
  supabase: SupabaseClient,
  clientProfileIds: string[],
  tenantId: string,
): Promise<string[]> {
  const { data: psrRows } = await supabase
    .from("profile_service_roles")
    .select("service_id")
    .in("client_profile_id", clientProfileIds)
    .eq("tenant_id", tenantId);
  const seen = new Set<string>();
  for (const r of psrRows ?? []) {
    const sid = (r as { service_id: string | null }).service_id;
    if (sid) seen.add(sid);
  }
  return Array.from(seen);
}
