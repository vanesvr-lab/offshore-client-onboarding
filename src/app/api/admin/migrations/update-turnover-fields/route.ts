import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const TEMPLATE_IDS = [
  "11111111-1111-1111-1111-111111111111", // GBC
  "22222222-2222-2222-2222-222222222222", // AC
];

/**
 * One-time migration: replace the single estimated_turnover_3yr field with
 * three per-year fields (year1, year2, year3) on GBC and AC service templates.
 *
 * POST /api/admin/migrations/update-turnover-fields
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
    const hasOldField = fields.some((f) => f.key === "estimated_turnover_3yr");

    if (!hasOldField) {
      results.push({ id: templateId, updated: false, reason: "estimated_turnover_3yr field not found (already migrated?)" });
      continue;
    }

    // Replace estimated_turnover_3yr with three separate year fields in the same position
    const updatedFields = fields.reduce<Array<Record<string, unknown>>>((acc, f) => {
      if (f.key !== "estimated_turnover_3yr") {
        acc.push(f);
        return acc;
      }
      const section = (f.section as string) ?? "Financial";
      acc.push(
        {
          key: "estimated_turnover_year1",
          label: "Estimated annual turnover — Year 1",
          type: "text",
          placeholder: "e.g. USD 500,000",
          section,
        },
        {
          key: "estimated_turnover_year2",
          label: "Estimated annual turnover — Year 2",
          type: "text",
          placeholder: "e.g. USD 750,000",
          section,
        },
        {
          key: "estimated_turnover_year3",
          label: "Estimated annual turnover — Year 3",
          type: "text",
          placeholder: "e.g. USD 1,000,000",
          section,
        },
      );
      return acc;
    }, []);

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
