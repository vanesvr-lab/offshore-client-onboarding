import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/knowledge-base — list all entries (with optional filters)
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const onlyActive = url.searchParams.get("active") !== "false";

  const supabase = createAdminClient();
  let query = supabase
    .from("knowledge_base")
    .select("*")
    .order("category")
    .order("title");

  if (category) query = query.eq("category", category);
  if (onlyActive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}

// POST /api/admin/knowledge-base — create a new entry
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { title, category, content, applies_to, source } = body;

  if (!title || !category || !content) {
    return NextResponse.json(
      { error: "title, category, and content are required" },
      { status: 400 }
    );
  }

  const validCategories = ["rule", "document_requirement", "regulatory_text", "general"];
  if (!validCategories.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${validCategories.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("knowledge_base")
    .insert({
      title,
      category,
      content,
      applies_to: applies_to ?? {},
      source: source ?? null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath("/admin/settings/knowledge-base");
  return NextResponse.json({ entry: data });
}
