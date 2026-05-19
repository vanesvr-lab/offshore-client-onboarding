import { NextResponse } from "next/server";
import { Resend } from "resend";
import { SignJWT } from "jose";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { getTenantBrand, formatFooter } from "@/lib/tenant-brand";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

// B-127 — Resend the magic-link invite for an admin who hasn't set a
// password yet (`users.password_hash IS NULL`). Refuses if the admin is
// already active (set their password) so the endpoint can't be abused
// to log a fresh JWT under an active account.

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.user.adminPermissions?.admin_mgmt_access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: adminUserId } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);
  const brand = await getTenantBrand(supabase, tenantId);
  const footerLine = formatFooter(brand) || brand.portal_name;

  const { data: row } = await supabase
    .from("admin_users")
    .select("id, user_id, users!inner(id, email, full_name, password_hash), admin_roles!inner(id, slug, name)")
    .eq("id", adminUserId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Admin not found" }, { status: 404 });

  const r = row as unknown as {
    id: string;
    user_id: string;
    users: { id: string; email: string; full_name: string; password_hash: string | null };
    admin_roles: { id: string; slug: string; name: string };
  };

  if (r.users.password_hash) {
    return NextResponse.json(
      { error: "This admin has already set their password. No resend needed." },
      { status: 400 },
    );
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({
    sub: r.users.id,
    email: r.users.email,
    purpose: "admin_invite",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const inviteUrl = `${appUrl}/auth/set-password?token=${encodeURIComponent(token)}`;

  const subject = `Reminder: your ${brand.portal_name} admin invite`;
  const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">${brand.portal_name}</h1>
        </div>
        <div style="padding: 36px; background: #ffffff;">
          <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">Hi ${r.users.full_name || ""},</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            Just a reminder — your invite to the ${brand.portal_name} admin portal as
            <strong>${r.admin_roles.name}</strong> is still pending.
            Use the button below to set your password.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}"
               style="background: #1a365d; color: white; padding: 14px 32px; border-radius: 6px;
                      text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Set up my account
            </a>
          </div>
          <p style="color: #718096; font-size: 13px;">
            This link expires in 24 hours.
          </p>
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          ${footerLine}
        </div>
      </div>
    `;

  const { error: emailErr } = await resend.emails.send({
    from: `${brand.portal_name} <${process.env.RESEND_FROM_EMAIL!}>`,
    to: r.users.email,
    subject,
    html,
  });
  if (emailErr) {
    return NextResponse.json(
      { error: `Failed to send invite email: ${emailErr.message}` },
      { status: 500 },
    );
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "admin_invite_resent",
    entity_type: "admin_user",
    entity_id: r.users.id,
    previous_value: null,
    new_value: { email: r.users.email },
  });

  return NextResponse.json({ success: true });
}
