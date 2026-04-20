import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiExtractionField } from "@/types";

/**
 * B-044 — one-shot reseed for the "Proof of Residential Address" doc type.
 *
 * An admin-editable dropdown in /admin/settings/rules can clear the
 * `prefill_field` mapping on an extraction field (no confirm step). When that
 * happens on POA's `address_on_document` row, the Identity step's prefill
 * helper has nothing to map to the `address` form field, so the top "Fill from
 * uploaded document" button no longer shows for address even though the AI
 * did extract a valid value.
 *
 * This endpoint restores the canonical seed config for POA only — idempotent,
 * admin-only. It also re-enables `ai_extraction_enabled` in case that got
 * toggled off. Other doc types are untouched.
 *
 * POST /api/admin/migrations/reseed-proof-of-address-extraction
 */
const POA_EXTRACTION_FIELDS: AiExtractionField[] = [
  { key: "address_on_document", label: "Address", ai_hint: "Full address shown on document", type: "string", prefill_field: "address" },
  { key: "document_date", label: "Document date", ai_hint: "Statement or issue date", type: "date", prefill_field: null },
  { key: "account_holder_name", label: "Name on document", ai_hint: "Account holder / addressee", type: "string", prefill_field: null },
];

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: row, error: fetchError } = await supabase
    .from("document_types")
    .select("id, name, ai_enabled, ai_extraction_enabled, ai_extraction_fields")
    .ilike("name", "Proof of Residential Address")
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Proof of Residential Address doc type not found" }, { status: 404 });

  const before = {
    ai_enabled: row.ai_enabled,
    ai_extraction_enabled: row.ai_extraction_enabled,
    ai_extraction_fields: row.ai_extraction_fields,
  };

  const { error: updateError } = await supabase
    .from("document_types")
    .update({
      ai_enabled: true,
      ai_extraction_enabled: true,
      ai_extraction_fields: POA_EXTRACTION_FIELDS,
    })
    .eq("id", row.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    id: row.id,
    before,
    after: {
      ai_enabled: true,
      ai_extraction_enabled: true,
      ai_extraction_fields: POA_EXTRACTION_FIELDS,
    },
  });
}
