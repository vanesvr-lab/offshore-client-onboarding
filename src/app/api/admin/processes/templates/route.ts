import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const clientType = searchParams.get("clientType");

  const supabase = createAdminClient();
  let query = supabase
    .from("process_templates")
    .select(`*, process_requirements(*, document_types(*))`)
    .eq("is_active", true)
    .order("sort_order");

  if (clientType && clientType !== "all") {
    query = query.or(`client_type.eq.${clientType},client_type.eq.both`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}
