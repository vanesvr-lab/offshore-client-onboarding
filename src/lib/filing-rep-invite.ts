// B-131 — Filing representative invite. When a client_profile gets
// filing_rep_email set (either at create-time or via a PATCH that
// flips a previously-null email to a real address), upsert the rep's
// users row and send them a magic-link `purpose=filing_rep_invite`
// email. The set-password POST already accepts this purpose alongside
// the existing admin/client invite purposes.

import { SignJWT } from "jose";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_BRAND } from "@/lib/platform-brand";
import { getTenantBrand, formatFooter } from "@/lib/tenant-brand";

const resend = new Resend(process.env.RESEND_API_KEY!);

interface SendFilingRepInviteArgs {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  repName: string;
  directorName: string;
  tenantId: string;
}

/**
 * Upserts a `users` row for the rep + mirrors to the legacy `profiles`
 * table, then returns the userId. Callers pass that into
 * sendFilingRepInvite to mint + email the magic link.
 */
export async function upsertRepUser(
  supabase: SupabaseClient,
  tenantId: string,
  email: string,
  repName: string,
): Promise<string> {
  const lower = email.trim().toLowerCase();

  const { data: existing } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .ilike("email", lower)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: inserted, error } = await supabase
    .from("users")
    .insert({
      tenant_id: tenantId,
      email: lower,
      full_name: repName,
      password_hash: null,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    throw new Error(error?.message ?? "Failed to upsert rep user");
  }

  // Mirror into the legacy `profiles` table so the NextAuth credentials
  // fallback path resolves the rep on first login until it sets a
  // password (the set-password POST already dual-writes the hash).
  await supabase.from("profiles").insert({
    id: inserted.id,
    tenant_id: tenantId,
    email: lower,
    full_name: repName,
    password_hash: null,
    is_deleted: false,
  });

  return inserted.id as string;
}

export async function sendFilingRepInvite({
  supabase,
  userId,
  email,
  repName,
  directorName,
  tenantId,
}: SendFilingRepInviteArgs): Promise<void> {
  const brand = await getTenantBrand(supabase, tenantId);
  const footerLine = formatFooter(brand) || brand.portal_name;

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({
    sub: userId,
    email,
    purpose: "filing_rep_invite",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/auth/set-password?token=${encodeURIComponent(token)}`;

  const subject = `You've been added as a filing representative — ${brand.display_name}`;
  const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e3a8a; padding: 20px;">
          <h1 style="color: white; margin: 0; font-size: 22px;">${brand.portal_name}</h1>
        </div>
        <div style="padding: 24px; color: #1a202c;">
          <p>Hi ${repName},</p>
          <p>You've been added as the filing representative for <strong>${directorName}</strong> on the ${brand.portal_name}. This means you can complete their KYC paperwork on their behalf.</p>
          <p>Set your password to log in:</p>
          <p>
            <a href="${inviteUrl}" style="background: #1e3a8a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Set Password &amp; Log In
            </a>
          </p>
          <p style="font-size: 12px; color: #64748b;">This link expires in 24 hours. If you weren't expecting this, contact your account manager.</p>
        </div>
        <div style="padding: 16px 24px; background: #f1f5f9; font-size: 11px; color: #64748b;">
          ${footerLine} · Powered by ${PLATFORM_BRAND.name}
        </div>
      </div>
    `;

  await resend.emails.send({
    from: `${brand.portal_name} <${process.env.RESEND_FROM_EMAIL!}>`,
    to: email,
    subject,
    html,
  });
}
