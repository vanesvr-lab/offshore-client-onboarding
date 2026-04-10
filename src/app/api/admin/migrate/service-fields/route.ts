import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * POST /api/admin/migrate/service-fields
 * One-time migration: updates GBC and AC template service_fields to:
 *   - Fix "Require a Mauritius Bank Account?" label
 *   - Convert bank field from text → select with full bank list
 */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Fetch all templates with GBC or AC in the name
  const { data: templates, error: fetchErr } = await supabase
    .from("service_templates")
    .select("id, name, service_fields")
    .or("name.ilike.%GBC%,name.ilike.%AC%,name.ilike.%Authorised Company%,name.ilike.%Global Business%");

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const results: { id: string; name: string; updated: boolean }[] = [];

  for (const tpl of templates ?? []) {
    const fields = (tpl.service_fields ?? []) as Array<Record<string, unknown>>;
    let changed = false;

    const updated = fields.map((f) => {
      const label = f.label as string | undefined;

      // Fix Mauritius bank account question label
      if (label?.toLowerCase().includes("mauritian bank account")) {
        changed = true;
        return { ...f, label: "Require a Mauritius Bank Account?" };
      }

      // Convert bank name field to select
      if (
        label?.toLowerCase().includes("bank") &&
        (label?.toLowerCase().includes("name") || label?.toLowerCase().includes("wish") || label?.toLowerCase().includes("account with"))
      ) {
        changed = true;
        return {
          ...f,
          label: "Preferred bank name",
          type: "select",
          options: BANKS,
        };
      }

      return f;
    });

    if (changed) {
      const { error: updateErr } = await supabase
        .from("service_templates")
        .update({ service_fields: updated })
        .eq("id", tpl.id);

      results.push({ id: tpl.id, name: tpl.name, updated: !updateErr });
    } else {
      results.push({ id: tpl.id, name: tpl.name, updated: false });
    }
  }

  return NextResponse.json({ results });
}
