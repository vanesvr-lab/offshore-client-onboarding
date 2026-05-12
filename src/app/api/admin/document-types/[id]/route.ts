import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/** PATCH /api/admin/document-types/[id] — Update a document type */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;

  const ALLOWED = ["name", "category", "applies_to", "scope", "description", "is_active", "sort_order", "valid_for_months"];
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key];
  }
  if ("scope" in patch && patch.scope !== "person" && patch.scope !== "application") {
    return NextResponse.json({ error: "scope must be 'person' or 'application'" }, { status: 400 });
  }
  if ("valid_for_months" in patch) {
    const v = patch.valid_for_months;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 120)) {
      return NextResponse.json(
        { error: "valid_for_months must be an integer 1-120 or null" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  if (patch.name && typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("document_types")
    .select(ALLOWED.join(","))
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("document_types")
    .update(patch)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const previous: Record<string, unknown> = {};
  const before = (existing ?? null) as unknown as Record<string, unknown> | null;
  for (const key of Object.keys(patch)) {
    previous[key] = before?.[key] ?? null;
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "document_type_updated",
    entity_type: "document_type",
    entity_id: id,
    previous_value: previous,
    new_value: patch,
  });

  return NextResponse.json({ ok: true });
}
