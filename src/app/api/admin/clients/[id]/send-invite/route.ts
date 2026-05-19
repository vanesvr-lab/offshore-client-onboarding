import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { getTenantBrand, formatFooter } from "@/lib/tenant-brand";
import { Resend } from "resend";
import { SignJWT } from "jose";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { logCommunication } from "@/lib/email/logCommunication";
import { findServiceIdsForClient } from "@/lib/email/findServices";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);
  const brand = await getTenantBrand(supabase, tenantId);
  const footerLine = formatFooter(brand) || brand.portal_name;

  const { data: client } = await supabase
    .from("clients")
    .select(`id, company_name, client_users(role, profiles!client_users_user_id_fkey(id, full_name, email))`)
    .eq("id", params.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const users = client.client_users as unknown as {
    role: string;
    profiles: { id: string; full_name: string | null; email: string | null } | null;
  }[];
  const owner = users.find((u) => u.role === "owner");
  if (!owner?.profiles?.email) {
    return NextResponse.json({ error: "No owner email found" }, { status: 400 });
  }

  const { email, full_name, id: userId } = owner.profiles;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Generate signed invite token (24h expiry)
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({ sub: userId!, email: email!, purpose: "invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  const inviteUrl = `${appUrl}/auth/set-password?token=${encodeURIComponent(token)}`;

  const emailSubject = `Welcome to ${brand.portal_name} — Set up your account`;
  const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">${brand.portal_name}</h1>
          <p style="color: #90cdf4; margin: 6px 0 0; font-size: 13px;">The intelligent portal for client due diligence and compliance</p>
        </div>
        <div style="padding: 36px; background: #ffffff;">
          <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">Dear ${full_name || ""},</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            Your client account has been created for <strong>${client.company_name}</strong>.
            Please click the button below to set your password and access your onboarding portal.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}"
               style="background: #1a365d; color: white; padding: 14px 32px; border-radius: 6px;
                      text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Set up my account
            </a>
          </div>
          <p style="color: #718096; font-size: 13px;">
            This link expires in 24 hours. If you did not expect this email, please contact us.
          </p>
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          ${footerLine}
        </div>
      </div>
    `;

  const { data: emailResult, error: emailError } = await resend.emails.send({
    from: `${brand.portal_name} <${process.env.RESEND_FROM_EMAIL!}>`,
    to: email!,
    subject: emailSubject,
    html: emailHtml,
  });

  if (emailError) {
    return NextResponse.json(
      { error: `Failed to send email: ${emailError.message}` },
      { status: 500 }
    );
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("clients")
    .update({ invite_sent_at: sentAt })
    .eq("id", params.id);

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "client_invite_sent",
    entity_type: "client",
    entity_id: params.id,
    previous_value: null,
    new_value: { sent_at: sentAt },
    detail: { email },
  });

  // B-108 — fanout to every service tied to this client (one log row per).
  // `service_communications.service_id` is NOT NULL — clients with no
  // services yet (the common signup-invite case) silently produce zero
  // rows. Comms log is best-effort, never blocks.
  try {
    const serviceIds = await findServiceIdsForClient(supabase, params.id, tenantId);
    for (const sid of serviceIds) {
      await logCommunication({
        serviceId: sid,
        tenantId,
        sentBy: session.user.id,
        sentByName: session.user.name ?? session.user.email ?? null,
        sentToEmail: email ?? null,
        sentToProfileId: userId ?? null,
        emailType: "client_signup_invite",
        subject: emailSubject,
        bodyHtml: emailHtml,
        relatedEntityType: "profile",
        relatedEntityId: userId ?? null,
        resendMessageId: emailResult?.id ?? null,
        status: "sent",
      });
    }
  } catch (err) {
    console.error("[clients/send-invite] comms log fanout failed:", err);
  }

  revalidatePath(`/admin/clients/${params.id}`);
  return NextResponse.json({ success: true, emailId: emailResult?.id });
}
