import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * B-049 Batch 1 — Apply the `scope` column to document_types and backfill
 * sensible defaults. This mirrors `supabase/migrations/006-document-scope-flag.sql`
 * but runs through the service role so the user can apply it without DB
 * shell access.
 *
 * Idempotent + admin-only. POST /api/admin/migrations/seed-document-scope
 *
 * Returns the resulting per-type scope assignments so the user can sanity-check
 * the outcome before testing the wizard.
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

  // 1. Add the column + check constraint if not present.
  // Supabase's REST endpoint can't run DDL directly, so we go through the
  // postgres function we'd normally provide via supabase CLI. Fall back to
  // verifying the column exists by selecting it; if the select fails we
  // return a clear pointer so the user can apply 006-document-scope-flag.sql.
  const probe = await supabase.from("document_types").select("id, scope").limit(1);
  if (probe.error) {
    return NextResponse.json(
      {
        error:
          "document_types.scope column missing. Apply supabase/migrations/006-document-scope-flag.sql first (psql or Supabase SQL editor), then re-run this endpoint.",
        details: probe.error.message,
      },
      { status: 412 }
    );
  }

  // 2. Backfill scopes deterministically.
  const { data: rows, error: fetchError } = await supabase
    .from("document_types")
    .select("id, name, applies_to, scope");
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const updates: { id: string; name: string; before: string; after: string }[] = [];

  for (const row of rows ?? []) {
    const before = ((row.scope as string | null) ?? "person").toLowerCase();
    const after = row.applies_to === "organisation" ? "application" : "person";
    if (before !== after) {
      const { error: updError } = await supabase
        .from("document_types")
        .update({ scope: after })
        .eq("id", row.id);
      if (updError) {
        return NextResponse.json({ error: updError.message }, { status: 500 });
      }
      updates.push({ id: row.id, name: row.name, before, after });
    }
  }

  // 3. Return the final per-type assignment so the user can eyeball it.
  const { data: final } = await supabase
    .from("document_types")
    .select("id, name, category, applies_to, scope")
    .order("scope")
    .order("category");

  return NextResponse.json({
    ok: true,
    changed: updates.length,
    updates,
    final,
  });
}
