import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { linkedToType, linkedToId, requiredBy } = await request.json() as {
    linkedToType: string;
    linkedToId: string;
    requiredBy?: string;
  };

  if (!linkedToType || !linkedToId) {
    return NextResponse.json({ error: "linkedToType and linkedToId are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("document_links")
    .insert({
      document_id: params.id,
      linked_to_type: linkedToType,
      linked_to_id: linkedToId,
      required_by: requiredBy || null,
      linked_by: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: data });
}
