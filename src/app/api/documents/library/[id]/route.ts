import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// GET single document by ID (used by upload widget to poll for verification result)
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*, document_types(*)")
    .eq("id", params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ document: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { notes?: string; expiry_date?: string; is_active?: boolean };

  const supabase = createAdminClient();

  // Fetch to get client_id for revalidation
  const { data: existing } = await supabase
    .from("documents")
    .select("client_id")
    .eq("id", params.id)
    .single();

  const { error } = await supabase
    .from("documents")
    .update({
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.expiry_date !== undefined && { expiry_date: body.expiry_date || null }),
      ...(body.is_active !== undefined && { is_active: body.is_active }),
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.client_id) {
    revalidatePath(`/admin/clients/${existing.client_id}/documents`);
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("documents")
    .select("client_id")
    .eq("id", params.id)
    .single();

  // Soft delete — preserve file in storage
  const { error } = await supabase
    .from("documents")
    .update({ is_active: false })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.client_id) {
    revalidatePath(`/admin/clients/${existing.client_id}/documents`);
  }
  return NextResponse.json({ success: true });
}
