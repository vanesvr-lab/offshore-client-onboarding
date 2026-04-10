import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocumentType } from "@/types";

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("document_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by category
  const grouped: Record<string, DocumentType[]> = {};
  for (const dt of (data ?? []) as DocumentType[]) {
    if (!grouped[dt.category]) grouped[dt.category] = [];
    grouped[dt.category].push(dt);
  }

  return NextResponse.json({ documentTypes: data ?? [], types: data ?? [], grouped });
}
