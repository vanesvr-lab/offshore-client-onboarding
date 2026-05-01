import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiExtractionField } from "@/types";

/**
 * B-049 Batch 2 — Apply (or rather verify) the structured residential-address
 * columns and re-seed the Proof of Residential Address extraction so the AI
 * fills the new fields directly.
 *
 * Mirrors `supabase/migrations/007-residential-address-fields.sql` for the
 * column add. DDL is the user's responsibility (run the SQL file or Supabase
 * SQL editor); this endpoint just probes that the columns exist and updates
 * the POA extraction config.
 *
 * Idempotent + admin-only. POST /api/admin/migrations/seed-residential-address-fields
 */

const POA_EXTRACTION_FIELDS: AiExtractionField[] = [
  // Original free-text address — kept for backwards compatibility with the
  // legacy `address` column / older admin views.
  {
    key: "address_on_document",
    label: "Address (full)",
    ai_hint: "Full address shown on document, single line",
    type: "string",
    prefill_field: "address",
  },
  // Structured address fields — fed into the new Residential Address sub-step.
  {
    key: "address_line_1",
    label: "Address line 1",
    ai_hint: "Street number and street name (without city / postal code)",
    type: "string",
    prefill_field: "address_line_1",
  },
  {
    key: "address_line_2",
    label: "Address line 2",
    ai_hint: "Apartment / unit / building, if any. Empty string if not present.",
    type: "string",
    prefill_field: "address_line_2",
  },
  {
    key: "address_city",
    label: "City",
    ai_hint: "City / town / locality",
    type: "string",
    prefill_field: "address_city",
  },
  {
    key: "address_state",
    label: "State / Region",
    ai_hint: "State, province, region, or county. Empty string if not present.",
    type: "string",
    prefill_field: "address_state",
  },
  {
    key: "address_postal_code",
    label: "Postal code",
    ai_hint: "ZIP / postal code. Empty string if not present.",
    type: "string",
    prefill_field: "address_postal_code",
  },
  {
    key: "address_country",
    label: "Country",
    ai_hint: "Country name (full English name, e.g. 'Mauritius', 'United Kingdom')",
    type: "string",
    prefill_field: "address_country",
  },
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

  // Probe that the new columns exist on at least one of the tables we care
  // about. If not, point the user to the SQL migration file.
  const probe = await supabase
    .from("client_profile_kyc")
    .select("id, address_line_1, address_country")
    .limit(1);
  if (probe.error) {
    return NextResponse.json(
      {
        error:
          "Residential-address columns missing. Apply supabase/migrations/007-residential-address-fields.sql first, then re-run.",
        details: probe.error.message,
      },
      { status: 412 }
    );
  }

  // Find POA doc type and replace its extraction config.
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
