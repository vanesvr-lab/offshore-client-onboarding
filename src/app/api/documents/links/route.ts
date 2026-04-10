import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const linkedToType = searchParams.get("linkedToType");
  const linkedToId = searchParams.get("linkedToId");

  if (!linkedToType || !linkedToId) {
    return NextResponse.json({ error: "linkedToType and linkedToId are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("document_links")
    .select("*, documents(*, document_types(*))")
    .eq("linked_to_type", linkedToType)
    .eq("linked_to_id", linkedToId)
    .order("linked_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ links: data ?? [] });
}
