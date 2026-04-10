import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_FIELDS = [
  "company_name",
  "client_type",
  "loe_sent_at",
  "invoice_sent_at",
  "payment_received_at",
  "portal_link_sent_at",
  "kyc_completed_at",
  "application_submitted_at",
];

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;

  // Pick only allowed fields
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => ALLOWED_FIELDS.includes(k))
  );

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("clients")
    .update(updates)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${params.id}`);
  return NextResponse.json({ success: true });
}
