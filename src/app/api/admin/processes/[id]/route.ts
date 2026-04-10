import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("client_processes")
    .select(`
      *,
      process_templates(*),
      process_documents(
        *,
        document_types:process_requirements(document_types(*)),
        documents(*, document_types(*))
      )
    `)
    .eq("id", params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ process: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { status, notes } = await request.json() as { status?: string; notes?: string };
  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch process to get client_id for revalidation
  const { data: proc } = await supabase
    .from("client_processes")
    .select("client_id")
    .eq("id", params.id)
    .single();

  const { error } = await supabase
    .from("client_processes")
    .update(updates)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (proc?.client_id) revalidatePath(`/admin/clients/${proc.client_id}`);
  return NextResponse.json({ success: true });
}
