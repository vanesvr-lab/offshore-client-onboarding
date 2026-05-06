import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY!);

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * POST /api/services/[id]/persons/[roleId]/send-invite
 *
 * Client-accessible route to send a KYC invite to a person on a service.
 * Caller must have can_manage=true for the service.
 */
function roleToLabel(role: string): string {
  const map: Record<string, string> = {
    director: "Director",
    shareholder: "Shareholder",
    ubo: "UBO",
    secretary: "Secretary",
    trustee: "Trustee",
    beneficiary: "Beneficiary",
    protector: "Protector",
    settlor: "Settlor",
  };
  return map[role.toLowerCase()] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; roleId: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { email?: string; note?: string };
  const senderNote = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  // Admins can always send invites; clients must have can_manage=true
  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const { data: callerRole } = await supabase
      .from("profile_service_roles")
      .select("id")
      .eq("service_id", params.id)
      .eq("client_profile_id", session.user.clientProfileId ?? "")
      .eq("can_manage", true)
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    if (!callerRole) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Fetch service name for the email
  const { data: serviceRow } = await supabase
    .from("services")
    .select("service_templates(name)")
    .eq("id", params.id)
    .maybeSingle();
  const serviceName = (serviceRow?.service_templates as unknown as { name: string } | null)?.name ?? "your service";

  // Get the target person's profile via roleId (include role for label + rate-limit state)
  const { data: roleRow } = await supabase
    .from("profile_service_roles")
    .select(`
      id, role, invite_sent_at, invites_sent_count_24h, invites_count_window_start,
      client_profiles(id, full_name, email)
    `)
    .eq("id", params.roleId)
    .eq("service_id", params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!roleRow) {
    return NextResponse.json({ error: "Person not found on this service" }, { status: 404 });
  }

  // B-067 §6.2 — 3 invites per profile/service pair per rolling 24h window.
  // Replaces the previous "1 per 24h" cooldown. Admins are still exempt.
  const RATE_LIMIT_MAX = 3;
  const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
  const limitState = roleRow as unknown as {
    invites_sent_count_24h: number | null;
    invites_count_window_start: string | null;
  };
  const windowStartedAt = limitState.invites_count_window_start
    ? new Date(limitState.invites_count_window_start).getTime()
    : null;
  const currentCount = limitState.invites_sent_count_24h ?? 0;
  const now = Date.now();
  const windowIsActive =
    windowStartedAt != null && now - windowStartedAt < RATE_LIMIT_WINDOW_MS;

  if (!isAdmin && windowIsActive && currentCount >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((windowStartedAt! + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    return NextResponse.json(
      {
        error: "rate_limited",
        retry_after_seconds: retryAfterSeconds,
        retry_after: new Date(windowStartedAt! + RATE_LIMIT_WINDOW_MS).toISOString(),
      },
      { status: 429 }
    );
  }

  const profile = (roleRow.client_profiles as unknown as { id: string; full_name: string | null; email: string | null } | null);
  const roleLabel = roleToLabel((roleRow as unknown as { role: string }).role ?? "");
  if (!profile?.email) {
    return NextResponse.json(
      { error: "This person has no email address — add one before sending an invite" },
      { status: 400 }
    );
  }

  // Generate invite token and code
  const accessToken = generateToken();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  // B-056 §1.2 — store the invite keyed on (email, client_profile_id) so a
  // user with multiple roles (Director + Shareholder + UBO on the same
  // service) doesn't see their first link wiped by the second invite. Any
  // earlier ACTIVE row is marked `superseded_at` (instead of deleted) so
  // verify-code can return a clear "your invite was updated" 410 if the
  // old link is opened. The unique partial index on (email,
  // client_profile_id) WHERE verified_at IS NULL AND superseded_at IS NULL
  // (B-056 migration) keeps at most one active row per pair.
  const supersededAt = new Date().toISOString();
  await supabase
    .from("verification_codes")
    .update({ superseded_at: supersededAt })
    .eq("email", profile.email)
    .eq("client_profile_id", profile.id)
    .is("verified_at", null)
    .is("superseded_at", null);

  const { error: insertErr } = await supabase
    .from("verification_codes")
    .insert({
      access_token: accessToken,
      code,
      email: profile.email,
      client_profile_id: profile.id,
      expires_at: expiresAt,
    });
  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to create invite: ${insertErr.message}` },
      { status: 500 }
    );
  }

  // Send invite email
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const accessUrl = `${baseUrl}/kyc/fill/${accessToken}`;

  const senderName = session.user.name ?? "GWMS";
  const noteHtml = senderNote
    ? `<p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin-top: 24px; border-left: 3px solid #e2e8f0; padding-left: 12px;">
        <strong>Sender&rsquo;s Note:</strong> ${senderNote}
       </p>`
    : "";

  const { error: emailError } = await resend.emails.send({
    from: `GWMS Client Portal <${process.env.RESEND_FROM_EMAIL!}>`,
    to: profile.email,
    subject: `Complete your KYC — ${serviceName} at GWMS`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">GWMS Client Portal</h1>
          <p style="color: #90cdf4; margin: 6px 0 0; font-size: 13px;">KYC / AML Compliance Portal</p>
        </div>
        <div style="padding: 36px; background: #ffffff;">
          <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">Dear ${profile.full_name ?? ""},</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            You have been added as a <strong>${roleLabel}</strong> for the <strong>${serviceName}</strong> application at GWMS.
            Please complete your personal KYC information at your earliest convenience.
          </p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            When you open the link below, you will be asked to enter this verification code:
          </p>
          <div style="background: #f4f4f5; padding: 16px 24px; border-radius: 8px; text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a365d;">${code}</span>
          </div>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${accessUrl}"
               style="background: #1a365d; color: white; padding: 14px 32px; border-radius: 6px;
                      text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Complete my KYC profile →
            </a>
          </div>
          <p style="color: #718096; font-size: 13px;">
            This link expires in 72 hours. If you did not expect this email, please contact us.
          </p>
          ${noteHtml}
          <p style="color: #a0aec0; font-size: 12px; margin-top: 24px;">
            This email was autogenerated on behalf of ${senderName}.
          </p>
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          GWMS Client Portal | Mauritius
        </div>
      </div>
    `,
  });

  if (emailError) {
    return NextResponse.json(
      { error: `Failed to send email: ${emailError.message}` },
      { status: 500 }
    );
  }

  // Update invite_sent_at, invite_sent_by, and rate-limit window/count on the role row.
  // B-067 §6.2 — open or roll over the 24h window when needed; otherwise increment.
  const sentAt = new Date().toISOString();
  const isNewWindow = !windowIsActive;
  const nextCount = isNewWindow ? 1 : currentCount + 1;
  const nextWindowStart = isNewWindow
    ? sentAt
    : (limitState.invites_count_window_start ?? sentAt);

  await supabase
    .from("profile_service_roles")
    .update({
      invite_sent_at: sentAt,
      invite_sent_by: session.user.id,
      invites_sent_count_24h: nextCount,
      invites_count_window_start: nextWindowStart,
    })
    .eq("id", params.roleId);

  return NextResponse.json({
    ok: true,
    invite_sent_at: sentAt,
    invites_sent_count_24h: nextCount,
    invites_count_window_start: nextWindowStart,
    invites_remaining: Math.max(0, RATE_LIMIT_MAX - nextCount),
  });
}
