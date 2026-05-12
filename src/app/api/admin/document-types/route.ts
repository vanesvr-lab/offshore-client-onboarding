import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

/** POST /api/admin/document-types — Create a new document type */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name: string;
    category: string;
    applies_to?: string;
    scope?: string;
    description?: string;
    valid_for_months?: number | null;
  };

  if (!body.name?.trim() || !body.category) {
    return NextResponse.json({ error: "name and category are required" }, { status: 400 });
  }

  if (
    body.valid_for_months !== undefined &&
    body.valid_for_months !== null &&
    (typeof body.valid_for_months !== "number" || !Number.isFinite(body.valid_for_months) || body.valid_for_months < 1 || body.valid_for_months > 120)
  ) {
    return NextResponse.json(
      { error: "valid_for_months must be an integer 1-120 or null" },
      { status: 400 },
    );
  }

  const scope = body.scope === "application" ? "application" : "person";

  const supabase = createAdminClient();

  // Get max sort_order for this category
  const { data: maxRow } = await supabase
    .from("document_types")
    .select("sort_order")
    .eq("category", body.category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((maxRow?.sort_order as number | null) ?? 0) + 10;

  const { data, error } = await supabase
    .from("document_types")
    .insert({
      name: body.name.trim(),
      category: body.category,
      applies_to: body.applies_to ?? "both",
      scope,
      description: body.description?.trim() || null,
      valid_for_months: body.valid_for_months ?? null,
      is_active: true,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "document_type_created",
    entity_type: "document_type",
    entity_id: data.id,
    previous_value: null,
    new_value: {
      id: data.id,
      name: body.name.trim(),
      category: body.category,
      scope,
    },
  });

  return NextResponse.json({ id: data.id });
}
