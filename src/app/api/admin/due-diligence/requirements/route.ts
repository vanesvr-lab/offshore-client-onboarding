import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
