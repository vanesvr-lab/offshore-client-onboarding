import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/** POST /api/admin/role-requirements — Add a document type requirement for a role */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenantId = getTenantId(session);

  const body = (await request.json()) as {
    role: string;
    document_type_id: string;
  };

  const VALID_ROLES = ["primary_client", "director", "shareholder", "ubo"];
  if (!body.role || !VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (!body.document_type_id) {
    return NextResponse.json({ error: "document_type_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: maxRow } = await supabase
    .from("role_document_requirements")
    .select("sort_order")
    .eq("role", body.role)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((maxRow?.sort_order as number | null) ?? 0) + 10;

  const { data, error } = await supabase
    .from("role_document_requirements")
    .insert({
      tenant_id: tenantId,
      role: body.role,
      document_type_id: body.document_type_id,
      is_required: true,
      sort_order: sortOrder,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This document type is already required for this role" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
