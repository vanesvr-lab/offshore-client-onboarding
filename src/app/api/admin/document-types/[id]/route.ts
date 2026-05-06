import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const ALLOWED = ["name", "category", "applies_to", "scope", "description", "is_active", "sort_order"];
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key];
  }
  if ("scope" in patch && patch.scope !== "person" && patch.scope !== "application") {
    return NextResponse.json({ error: "scope must be 'person' or 'application'" }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  if (patch.name && typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("document_types")
    .update(patch)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
