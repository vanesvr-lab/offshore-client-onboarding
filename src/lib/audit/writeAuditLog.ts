// B-077 Batch 7 — small utility for inserting audit_log rows from API
// routes. Centralises the column shape so we don't repeat the insert
// across `section-reviews`, `substance`, `actions`, and the existing
// `documents/admin-status` route.
//
// audit_log columns relevant to admin actions on a service:
//   actor_id        — uuid of acting user
//   actor_role      — "admin" | "client" | "system"
//   action          — short identifier ("section_review_saved", etc.)
//   entity_type     — "service" | "document" | "application" | …
//   entity_id       — id of the entity that the action applies to
//   previous_value  — JSONB snapshot of the prior state
//   new_value       — JSONB snapshot of the new state
//   detail          — extra context (file_name, note, etc.)

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WriteAuditLogParams {
  actor_id: string;
  actor_role?: "admin" | "client" | "system";
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  detail?: Record<string, unknown> | null;
}

/**
 * Insert one audit_log row using the supplied admin/service-role client.
 * Returns nothing — writes are best-effort; an error is logged but never
 * surfaced to the caller (audit failures should not block the user-facing
 * mutation that succeeded).
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  params: WriteAuditLogParams,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    actor_id: params.actor_id,
    actor_role: params.actor_role ?? "admin",
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    previous_value: params.previous_value ?? null,
    new_value: params.new_value ?? null,
    detail: params.detail ?? null,
  });
  if (error) {
    console.error("[audit_log] insert failed", { params, error });
  }
}
