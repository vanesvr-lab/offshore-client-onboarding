import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-time migration: add service_number to existing services.
 *
 * IMPORTANT: Before running this route, you must manually execute this SQL
 * in the Supabase SQL editor (or dashboard):
 *
 *   ALTER TABLE services ADD COLUMN IF NOT EXISTS service_number text;
 *   CREATE UNIQUE INDEX IF NOT EXISTS idx_services_service_number
 *     ON services(service_number) WHERE service_number IS NOT NULL;
 *
 * POST /api/admin/migrations/add-service-numbers
 */

function getPrefix(templateName: string): string {
  const name = templateName.toLowerCase();
  if (name.includes("global business")) return "GBC";
  if (name.includes("authorised") || name.includes("authorized")) return "AC";
  if (name.includes("domestic")) return "DC";
  if (name.includes("trust") || name.includes("foundation")) return "TFF";
  if (name.includes("relocation")) return "RLM";
  return "SVC";
}

export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get current max sequence per prefix from already-numbered services
  const { data: existing } = await supabase
    .from("services")
    .select("service_number")
    .not("service_number", "is", null);

  const maxCounters: Record<string, number> = {};
  for (const svc of existing ?? []) {
    if (!svc.service_number) continue;
    const match = (svc.service_number as string).match(/^([A-Z]+)-(\d+)$/);
    if (match) {
      const prefix = match[1];
      const num = parseInt(match[2], 10);
      maxCounters[prefix] = Math.max(maxCounters[prefix] ?? 0, num);
    }
  }

  // Fetch services without service_number, joined with template name, ordered by created_at
  const { data: services, error } = await supabase
    .from("services")
    .select("id, created_at, service_templates(name)")
    .is("service_number", null)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!services || services.length === 0) {
    return NextResponse.json({ updated: 0, message: "No services to backfill" });
  }

  // Assign sequential numbers per prefix
  const prefixCounters: Record<string, number> = { ...maxCounters };
  const updates: Array<{ id: string; service_number: string }> = [];

  for (const svc of services) {
    const templateName =
      (svc.service_templates as unknown as { name: string } | null)?.name ?? "";
    const prefix = getPrefix(templateName);
    prefixCounters[prefix] = (prefixCounters[prefix] ?? 0) + 1;
    const seq = String(prefixCounters[prefix]).padStart(4, "0");
    updates.push({ id: svc.id, service_number: `${prefix}-${seq}` });
  }

  // Update each service
  let updatedCount = 0;
  const errors: string[] = [];

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from("services")
      .update({ service_number: update.service_number })
      .eq("id", update.id);

    if (updateError) {
      errors.push(`${update.id}: ${updateError.message}`);
    } else {
      updatedCount++;
    }
  }

  return NextResponse.json({
    updated: updatedCount,
    total: services.length,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
