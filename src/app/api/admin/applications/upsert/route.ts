import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { applicationId, clientId, templateId, ...fields } = body;

  const supabase = createAdminClient();
  const payload = {
    ...fields,
    template_id: templateId,
    client_id: clientId,
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  if (applicationId) {
    const { error } = await supabase.from("applications").update(payload).eq("id", applicationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ applicationId });
  } else {
    const { data, error } = await supabase.from("applications").insert(payload).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ applicationId: data.id });
  }
}
