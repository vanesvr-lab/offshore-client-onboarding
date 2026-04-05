import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendClientEmail } from "@/lib/email/sendEmail";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { to, subject, body, applicationId } = await request.json();
    if (!to || !subject || !body || !applicationId) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, body, applicationId" },
        { status: 400 }
      );
    }

    await sendClientEmail({ to, subject, body, applicationId, sentBy: user.id });

    // Write audit log
    await createAdminClient().from("audit_log").insert({
      application_id: applicationId,
      actor_id: user.id,
      action: "email_sent",
      detail: { to, subject },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email failed" },
      { status: 500 }
    );
  }
}
