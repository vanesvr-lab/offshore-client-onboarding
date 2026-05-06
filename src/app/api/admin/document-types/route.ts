import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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
  };

  if (!body.name?.trim() || !body.category) {
    return NextResponse.json({ error: "name and category are required" }, { status: 400 });
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
      is_active: true,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
