import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import type { DueDiligenceRequirement } from "@/types";

const CUMULATIVE: Record<string, string[]> = {
  sdd: ["basic", "sdd"],
  cdd: ["basic", "sdd", "cdd"],
  edd: ["basic", "sdd", "cdd", "edd"],
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  const levelParam = searchParams.get("level"); // sdd | cdd | edd | null (= all)

  let query = supabase
    .from("due_diligence_requirements")
    .select("*, document_types(id, name)")
    .order("sort_order");

  if (levelParam && CUMULATIVE[levelParam]) {
    const levels = CUMULATIVE[levelParam];
    query = query.in("level", levels);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requirements: (data ?? []) as DueDiligenceRequirement[] });
}

/** POST /api/admin/due-diligence/requirements — Create a new DD requirement */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = getTenantId(session);

  const body = (await request.json()) as {
    level: string;
    requirement_type: string;
    label: string;
    document_type_id?: string | null;
    field_key?: string | null;
    applies_to?: string;
    description?: string | null;
  };

  if (!body.level || !body.requirement_type || !body.label?.trim()) {
    return NextResponse.json({ error: "level, requirement_type, and label are required" }, { status: 400 });
  }

  const VALID_LEVELS = ["basic", "sdd", "cdd", "edd"];
  const VALID_TYPES = ["field", "document", "admin_check"];
  if (!VALID_LEVELS.includes(body.level) || !VALID_TYPES.includes(body.requirement_type)) {
    return NextResponse.json({ error: "Invalid level or requirement_type" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: maxRow } = await supabase
    .from("due_diligence_requirements")
    .select("sort_order")
    .eq("level", body.level)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((maxRow?.sort_order as number | null) ?? 0) + 10;

  const { data, error } = await supabase
    .from("due_diligence_requirements")
    .insert({
      tenant_id: tenantId,
      level: body.level,
      requirement_type: body.requirement_type,
      requirement_key: body.field_key ?? body.document_type_id ?? `req_${Date.now()}`,
      field_key: body.field_key ?? null,
      label: body.label.trim(),
      description: body.description?.trim() || null,
      document_type_id: body.document_type_id ?? null,
      applies_to: body.applies_to ?? "both",
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
