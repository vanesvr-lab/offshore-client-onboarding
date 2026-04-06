import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { applicationId, templateId, ...fields } = body;

  const supabase = createAdminClient();

  // Resolve clientId from session user
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!clientUser) return NextResponse.json({ error: "No client account found" }, { status: 403 });

  const payload = {
    ...fields,
    template_id: templateId,
    client_id: clientUser.client_id,
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  if (applicationId) {
    // Verify ownership before update
    const { data: existing } = await supabase
      .from("applications")
      .select("client_id")
      .eq("id", applicationId)
      .single();
    if (!existing || existing.client_id !== clientUser.client_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await supabase.from("applications").update(payload).eq("id", applicationId);
    return NextResponse.json({ applicationId });
  } else {
    const { data, error } = await supabase
      .from("applications")
      .insert(payload)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ applicationId: data.id });
  }
}
