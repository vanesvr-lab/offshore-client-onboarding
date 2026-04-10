import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  const [{ data: records, error: recError }, { data: documents, error: docError }] =
    await Promise.all([
      supabase
        .from("kyc_records")
        .select("*")
        .eq("client_id", params.clientId)
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("*, document_types(*)")
        .eq("client_id", params.clientId)
        .eq("is_active", true),
    ]);

  if (recError) return NextResponse.json({ error: recError.message }, { status: 500 });
  if (docError) return NextResponse.json({ error: docError.message }, { status: 500 });

  return NextResponse.json({ records: records ?? [], documents: documents ?? [] });
}
