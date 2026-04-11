import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { verificationRulesText: string };

  await supabase
    .from("document_types")
    .update({ verification_rules_text: body.verificationRulesText ?? null })
    .eq("id", params.id);

  revalidatePath("/admin/settings/rules");

  return NextResponse.json({ success: true });
}
