import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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

  const { company_name } = await request.json();
  if (!company_name?.trim()) {
    return NextResponse.json({ error: "company_name is required" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("clients")
    .update({ company_name: company_name.trim() })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${params.id}`);
  return NextResponse.json({ success: true });
}
