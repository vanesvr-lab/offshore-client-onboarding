import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendClientEmail } from "@/lib/email/sendEmail";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { to, subject, body, applicationId } = await request.json();
    if (!to || !subject || !body || !applicationId) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, body, applicationId" },
        { status: 400 }
      );
    }

    await sendClientEmail({ to, subject, body, applicationId, sentBy: session.user.id });

    await createAdminClient().from("audit_log").insert({
      application_id: applicationId,
      actor_id: session.user.id,
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
