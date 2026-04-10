import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const TEMPLATE_IDS = [
  "11111111-1111-1111-1111-111111111111", // GBC
  "22222222-2222-2222-2222-222222222222", // AC
];

const BANKS = [
  "Mauritius Commercial Bank (MCB)",
  "SBM Bank (Mauritius) Ltd",
  "AfrAsia Bank Limited",
  "Bank One Limited",
  "ABC Banking Corporation Ltd",
  "HSBC Bank (Mauritius) Limited",
  "Absa Bank (Mauritius) Limited",
  "Standard Bank (Mauritius) Limited",
  "Other",
];

/**
 * POST /api/admin/migrations/fix-labels
 * One-time migration: fixes service_fields for GBC and AC templates.
 *   - "requires_mauritian_bank" label → "Require a Mauritius Bank Account?"
 *   - "preferred_bank" label → "Preferred bank name (optional)", type text→select, adds bank list
 * Corresponds to supabase/migrations/002-fix-service-field-labels.sql
 */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: templates, error: fetchErr } = await supabase
    .from("service_templates")
    .select("id, name, service_fields")
    .in("id", TEMPLATE_IDS);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const results: { id: string; name: string; updated: boolean; error?: string }[] = [];

  for (const tpl of templates ?? []) {
    const fields = (tpl.service_fields ?? []) as Array<Record<string, unknown>>;

    const updated = fields.map((f) => {
      if (f.key === "requires_mauritian_bank") {
        return { ...f, label: "Require a Mauritius Bank Account?" };
      }
      if (f.key === "preferred_bank") {
        return {
          ...f,
          label: "Preferred bank name (optional)",
          type: "select",
          options: BANKS,
        };
      }
      return f;
    });

    const { error: updateErr } = await supabase
      .from("service_templates")
      .update({ service_fields: updated })
      .eq("id", tpl.id);

    results.push({
      id: tpl.id,
      name: tpl.name,
      updated: !updateErr,
      ...(updateErr ? { error: updateErr.message } : {}),
    });
  }

  return NextResponse.json({ results });
}
