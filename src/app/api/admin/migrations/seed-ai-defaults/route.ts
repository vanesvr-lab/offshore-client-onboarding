import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiExtractionField } from "@/types";

interface DefaultEntry {
  name: string;
  ai_enabled: boolean;
  ai_extraction_enabled: boolean;
  ai_extraction_fields: AiExtractionField[];
  /** Inserted only when document_types.verification_rules_text IS NULL. */
  verification_rules_text: string | null;
}

const DEFAULTS: DefaultEntry[] = [
  {
    name: "Certified Passport Copy",
    ai_enabled: true,
    ai_extraction_enabled: true,
    ai_extraction_fields: [
      { key: "passport_number", label: "Passport number", ai_hint: "MRZ or printed number", type: "string", prefill_field: "passport_number" },
      { key: "expiry_date", label: "Expiry date", ai_hint: "Expiry / date of expiry", type: "date", prefill_field: "passport_expiry" },
      { key: "full_name", label: "Full name", ai_hint: "Name as printed in MRZ", type: "string", prefill_field: "full_name" },
      { key: "nationality", label: "Nationality", ai_hint: "Country code or nationality", type: "string", prefill_field: "nationality" },
      { key: "date_of_birth", label: "Date of birth", ai_hint: "DOB on passport", type: "date", prefill_field: "date_of_birth" },
      { key: "passport_country", label: "Issuing country", ai_hint: "Country of issue", type: "string", prefill_field: "passport_country" },
    ],
    verification_rules_text:
      "1. Document must not be expired.\n2. The name on the passport must match the applicant's declared name.\n3. The document must be a certified copy (visible stamp/signature from solicitor, notary, or bank official).",
  },
  {
    name: "Proof of Residential Address",
    ai_enabled: true,
    ai_extraction_enabled: true,
    ai_extraction_fields: [
      { key: "address_on_document", label: "Address", ai_hint: "Full address shown on document", type: "string", prefill_field: "address" },
      { key: "document_date", label: "Document date", ai_hint: "Statement or issue date", type: "date", prefill_field: null },
      { key: "account_holder_name", label: "Name on document", ai_hint: "Account holder / addressee", type: "string", prefill_field: null },
    ],
    verification_rules_text:
      "1. The name on the document must match the applicant's declared name.\n2. The document must be dated within the last 3 months.\n3. The address must include a country.",
  },
  {
    name: "Bank Reference Letter",
    ai_enabled: true,
    ai_extraction_enabled: true,
    ai_extraction_fields: [
      { key: "bank_name", label: "Bank name", ai_hint: "Issuing bank", type: "string", prefill_field: null },
      { key: "letter_date", label: "Letter date", ai_hint: "Date of the reference letter", type: "date", prefill_field: null },
      { key: "customer_name", label: "Customer name", ai_hint: "Name referenced in the letter", type: "string", prefill_field: null },
    ],
    verification_rules_text:
      "1. The letter must be dated within the last 3 months.\n2. The customer referenced must be the applicant.\n3. The letter should confirm account in good standing.",
  },
  {
    name: "Curriculum Vitae / Resume",
    ai_enabled: true,
    ai_extraction_enabled: false,
    ai_extraction_fields: [],
    verification_rules_text:
      "1. The name on the CV should match the applicant.\n2. The stated occupation should align with the applicant's declared occupation.\n3. No need to extract any fields.",
  },
  {
    name: "Declaration of Source of Funds",
    ai_enabled: true,
    ai_extraction_enabled: false,
    ai_extraction_fields: [],
    verification_rules_text:
      "1. Document must be signed and dated.\n2. The name must match the applicant.",
  },
  {
    name: "Declaration of Source of Wealth",
    ai_enabled: true,
    ai_extraction_enabled: false,
    ai_extraction_fields: [],
    verification_rules_text:
      "1. Document must be signed and dated.\n2. The name must match the applicant.",
  },
  {
    name: "Evidence of Source of Funds",
    ai_enabled: true,
    ai_extraction_enabled: false,
    ai_extraction_fields: [],
    verification_rules_text: "1. Document should corroborate the declared source of funds.",
  },
  {
    name: "Evidence of Source of Wealth",
    ai_enabled: true,
    ai_extraction_enabled: false,
    ai_extraction_fields: [],
    verification_rules_text: "1. Document should corroborate the declared source of wealth.",
  },
  {
    name: "Professional Reference Letter",
    ai_enabled: true,
    ai_extraction_enabled: true,
    ai_extraction_fields: [
      { key: "letter_date", label: "Letter date", ai_hint: "Date on letterhead", type: "date", prefill_field: null },
    ],
    verification_rules_text:
      "1. The letter must be dated within the last 3 months.\n2. The letter must reference the applicant by name.",
  },
  {
    name: "PEP Declaration Form",
    ai_enabled: true,
    ai_extraction_enabled: false,
    ai_extraction_fields: [],
    verification_rules_text:
      "1. Document must be signed and dated.\n2. The declared PEP status must match the applicant's answer on the form.",
  },
  {
    name: "Tax Residency Certificate",
    ai_enabled: true,
    ai_extraction_enabled: true,
    ai_extraction_fields: [
      { key: "tax_id", label: "Tax ID", ai_hint: "TIN or tax number", type: "string", prefill_field: "tax_identification_number" },
      { key: "jurisdiction", label: "Jurisdiction", ai_hint: "Country of tax residency", type: "string", prefill_field: "jurisdiction_tax_residence" },
      { key: "issue_date", label: "Issue date", ai_hint: "Date issued", type: "date", prefill_field: null },
    ],
    verification_rules_text:
      "1. Document must be dated within the last 12 months.\n2. Applicant must be named on the certificate.",
  },
  {
    name: "Certificate of Incorporation",
    ai_enabled: true,
    ai_extraction_enabled: true,
    ai_extraction_fields: [
      { key: "company_name", label: "Company name", ai_hint: "Legal entity name", type: "string", prefill_field: null },
      { key: "registration_number", label: "Registration number", ai_hint: "Company number", type: "string", prefill_field: null },
      { key: "incorporation_date", label: "Incorporation date", ai_hint: "Date of incorporation", type: "date", prefill_field: null },
      { key: "jurisdiction", label: "Jurisdiction", ai_hint: "Country of incorporation", type: "string", prefill_field: null },
    ],
    verification_rules_text:
      "1. Document must be a certified copy.\n2. The company name must match the service application.",
  },
];

interface ResultRow {
  name: string;
  found: boolean;
  updated_ai_config: boolean;
  inserted_rules_text: boolean;
  error?: string;
}

/**
 * Idempotent seed for B-033: per-doc-type AI config defaults.
 *
 * - Always upserts ai_enabled / ai_extraction_enabled / ai_extraction_fields per the table.
 * - Only writes verification_rules_text when the existing column is NULL.
 * - For doc types not in the table: ensures ai_enabled=true, ai_extraction_enabled=false,
 *   ai_extraction_fields=[]. Leaves verification_rules_text untouched.
 *
 * POST /api/admin/migrations/seed-ai-defaults
 */
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

  const namedSet = new Set(DEFAULTS.map((d) => d.name.toLowerCase()));
  const results: ResultRow[] = [];

  // Pass 1: configured doc types
  for (const def of DEFAULTS) {
    const { data: row, error: fetchErr } = await supabase
      .from("document_types")
      .select("id, verification_rules_text")
      .ilike("name", def.name)
      .maybeSingle();

    if (fetchErr) {
      results.push({ name: def.name, found: false, updated_ai_config: false, inserted_rules_text: false, error: fetchErr.message });
      continue;
    }
    if (!row) {
      results.push({ name: def.name, found: false, updated_ai_config: false, inserted_rules_text: false });
      continue;
    }

    const update: Record<string, unknown> = {
      ai_enabled: def.ai_enabled,
      ai_extraction_enabled: def.ai_extraction_enabled,
      ai_extraction_fields: def.ai_extraction_fields,
    };
    let insertingRules = false;
    if (def.verification_rules_text && !row.verification_rules_text) {
      update.verification_rules_text = def.verification_rules_text;
      insertingRules = true;
    }

    const { error: updateErr } = await supabase
      .from("document_types")
      .update(update)
      .eq("id", row.id);

    results.push({
      name: def.name,
      found: true,
      updated_ai_config: !updateErr,
      inserted_rules_text: insertingRules && !updateErr,
      error: updateErr?.message,
    });
  }

  // Pass 2: any other active doc type — set safe defaults if columns are unset
  const { data: others } = await supabase
    .from("document_types")
    .select("id, name, ai_enabled, ai_extraction_enabled, ai_extraction_fields");
  const fallbackResults: { name: string; touched: boolean; error?: string }[] = [];
  for (const dt of (others ?? []) as Array<{
    id: string;
    name: string;
    ai_enabled: boolean | null;
    ai_extraction_enabled: boolean | null;
    ai_extraction_fields: unknown;
  }>) {
    if (namedSet.has(dt.name.toLowerCase())) continue;
    const update: Record<string, unknown> = {};
    if (dt.ai_enabled === null || dt.ai_enabled === undefined) update.ai_enabled = true;
    if (dt.ai_extraction_enabled === null || dt.ai_extraction_enabled === undefined) update.ai_extraction_enabled = false;
    if (!Array.isArray(dt.ai_extraction_fields)) update.ai_extraction_fields = [];
    if (Object.keys(update).length === 0) {
      fallbackResults.push({ name: dt.name, touched: false });
      continue;
    }
    const { error: e } = await supabase.from("document_types").update(update).eq("id", dt.id);
    fallbackResults.push({ name: dt.name, touched: !e, error: e?.message });
  }

  return NextResponse.json({
    seeded: results,
    fallbacks: fallbackResults,
    summary: {
      total_in_defaults: DEFAULTS.length,
      found: results.filter((r) => r.found).length,
      missing: results.filter((r) => !r.found).map((r) => r.name),
      rules_text_inserted: results.filter((r) => r.inserted_rules_text).length,
    },
  });
}
