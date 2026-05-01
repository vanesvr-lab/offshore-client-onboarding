import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * B-049 Batch 3 — Flag the doc types whose AI verification depends on
 * cross-form context (applicant name, declared occupation, declared
 * employer, declared source of funds, etc.) so the upload route skips the
 * immediate fire-and-forget AI run. The wizard's per-person "Save &
 * Continue" handler re-triggers AI with the full context once it's
 * available.
 *
 * Mirrors the brief's table — anything that needs comparison context is
 * deferred. Anything that's a pure "is this readable?" check (passport,
 * POA) keeps running AI on upload.
 *
 * Idempotent + admin-only.
 * POST /api/admin/migrations/seed-deferred-ai-doc-types
 */

const DEFERRED_DOC_TYPE_NAMES = [
  // CV — needs applicant name + declared occupation + employer.
  "Curriculum Vitae / Resume",
  // Source-of-funds evidence — needs declared source of funds + employer + role.
  "Evidence of Source of Funds",
  // Source-of-wealth evidence — needs declared sources from Declarations.
  "Evidence of Source of Wealth",
  // Bank reference — needs applicant full_name to compare against.
  "Bank Reference Letter",
  "Reference Letter (Bank)",
  // Employer / occupation letter — needs declared employer + role.
  "Proof of Occupation / Employment Letter",
  // Adverse media — needs name + jurisdictions from Declarations.
  "Adverse Media Report",
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

  // Probe that the column exists.
  const probe = await supabase.from("document_types").select("id, ai_deferred").limit(1);
  if (probe.error) {
    return NextResponse.json(
      {
        error:
          "document_types.ai_deferred column missing. Apply supabase/migrations/008-professional-details-and-deferred-ai.sql first.",
        details: probe.error.message,
      },
      { status: 412 }
    );
  }

  const updates: { name: string; matched: boolean; before: boolean; after: boolean }[] = [];

  for (const name of DEFERRED_DOC_TYPE_NAMES) {
    const { data: row } = await supabase
      .from("document_types")
      .select("id, name, ai_deferred")
      .ilike("name", name)
      .maybeSingle();

    if (!row) {
      updates.push({ name, matched: false, before: false, after: false });
      continue;
    }

    const before = row.ai_deferred === true;
    if (before) {
      updates.push({ name, matched: true, before, after: true });
      continue;
    }

    const { error } = await supabase
      .from("document_types")
      .update({ ai_deferred: true })
      .eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    updates.push({ name, matched: true, before, after: true });
  }

  return NextResponse.json({ ok: true, updates });
}
