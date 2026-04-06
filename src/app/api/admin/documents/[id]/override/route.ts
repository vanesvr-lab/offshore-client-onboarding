import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { verdict, note } = await request.json() as { verdict: "pass" | "fail"; note?: string };
  if (!verdict) return NextResponse.json({ error: "verdict is required" }, { status: 400 });
  if (verdict === "fail" && !note?.trim()) {
    return NextResponse.json({ error: "A note is required when overriding to fail" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: doc, error: fetchError } = await supabase
    .from("document_uploads")
    .select("application_id")
    .eq("id", params.id)
    .single();
  if (fetchError || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await supabase
    .from("document_uploads")
    .update({
      admin_override: verdict,
      admin_override_note: note || null,
      verification_status: verdict === "pass" ? "verified" : "flagged",
    })
    .eq("id", params.id);

  await supabase.from("audit_log").insert({
    application_id: doc.application_id,
    actor_id: session.user.id,
    action: "document_override",
    detail: { document_id: params.id, verdict, note: note || null },
  });

  return NextResponse.json({ success: true });
}
