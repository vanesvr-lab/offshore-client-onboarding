import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RoleDocumentRequirement } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("role_document_requirements")
    .select("*, document_types(id, name)")
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requirements: (data ?? []) as unknown as RoleDocumentRequirement[] });
}
