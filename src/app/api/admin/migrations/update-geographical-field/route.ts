import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const TEMPLATE_IDS = [
  "11111111-1111-1111-1111-111111111111", // GBC
  "22222222-2222-2222-2222-222222222222", // AC
];

/**
 * One-time migration: update the geographical_area service field in GBC and AC templates
 * to type="multi_select_country" with updated label/tooltip.
 *
 * POST /api/admin/migrations/update-geographical-field
 */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: { id: string; updated: boolean; reason?: string }[] = [];

  for (const templateId of TEMPLATE_IDS) {
    const { data: template, error } = await supabase
      .from("service_templates")
      .select("id, name, service_fields")
      .eq("id", templateId)
      .single();

    if (error || !template) {
      results.push({ id: templateId, updated: false, reason: "Template not found" });
      continue;
    }

    const fields = (template.service_fields ?? []) as Array<Record<string, unknown>>;
    const hasField = fields.some((f) => f.key === "geographical_area");

    if (!hasField) {
      results.push({ id: templateId, updated: false, reason: "geographical_area field not found" });
      continue;
    }

    const updatedFields = fields.map((f) => {
      if (f.key !== "geographical_area") return f;
      return {
        ...f,
        label: "Countries of operations (select applicable countries)",
        type: "multi_select_country",
        required: true,
        tooltip: "Select all countries where the company will operate or source revenue.",
      };
    });

    const { error: updateError } = await supabase
      .from("service_templates")
      .update({ service_fields: updatedFields })
      .eq("id", templateId);

    results.push({
      id: templateId,
      updated: !updateError,
      reason: updateError?.message,
    });
  }

  return NextResponse.json({ results });
}
