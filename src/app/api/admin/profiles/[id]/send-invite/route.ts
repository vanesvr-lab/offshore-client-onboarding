import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { clientId?: string };
  const supabase = createAdminClient();

  // Fetch the kyc_record (profile) to invite
  const { data: kycRecord } = await supabase
    .from("kyc_records")
    .select("id, full_name, email, client_id, is_primary, profile_id, clients(company_name)")
    .eq("id", params.id)
    .single();

  if (!kycRecord) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (!kycRecord.email) return NextResponse.json({ error: "Profile has no email — add an email first" }, { status: 400 });
  if (kycRecord.is_primary) return NextResponse.json({ error: "Primary profile invites use the main invite flow" }, { status: 400 });

  const clientId = body.clientId ?? kycRecord.client_id;
  const companyName = (kycRecord.clients as unknown as { company_name?: string } | null)?.company_name ?? "your company";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Find or create a profiles row for this email
  let profileUserId: string;

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", kycRecord.email)
    .maybeSingle();

  if (existingProfile) {
    profileUserId = existingProfile.id;
  } else {
    // Create a new profiles row with a temporary password hash
    const tempHash = await bcrypt.hash(Math.random().toString(36), 10);
    const { data: newProfile, error: profileErr } = await supabase
      .from("profiles")
      .insert({
        full_name: kycRecord.full_name,
        email: kycRecord.email,
        password_hash: tempHash,
      })
      .select("id")
      .single();
    if (profileErr || !newProfile) {
      return NextResponse.json({ error: "Failed to create user account" }, { status: 500 });
    }
    profileUserId = newProfile.id;
  }

  // Link kyc_record.profile_id → this profiles row
  await supabase
    .from("kyc_records")
    .update({ profile_id: profileUserId })
    .eq("id", params.id);

  // Ensure a client_users row exists so the user can log in (we don't add them as "owner")
  await supabase
    .from("client_users")
    .upsert({
      user_id: profileUserId,
      client_id: clientId,
      role: "member",
    }, { onConflict: "user_id,client_id" });

  // Generate signed invite token with kycRecordId embedded
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({
    sub: profileUserId,
    email: kycRecord.email,
    purpose: "profile_invite",
    kycRecordId: params.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("72h")
    .sign(secret);

  const inviteUrl = `${appUrl}/auth/set-password?token=${encodeURIComponent(token)}`;

  const { error: emailError } = await resend.emails.send({
    from: `Mauritius Offshore Client Portal <${process.env.RESEND_FROM_EMAIL!}>`,
    to: kycRecord.email,
    subject: `Complete your KYC profile — ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Mauritius Offshore Client Portal</h1>
          <p style="color: #90cdf4; margin: 6px 0 0; font-size: 13px;">KYC / AML Compliance Portal</p>
        </div>
        <div style="padding: 36px; background: #ffffff;">
          <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">Dear ${kycRecord.full_name ?? ""},</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            You have been added as a profile for <strong>${companyName}</strong>. Please click the button below
            to set your password and complete your KYC profile.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}"
               style="background: #1a365d; color: white; padding: 14px 32px; border-radius: 6px;
                      text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
              Complete my KYC profile
            </a>
          </div>
          <p style="color: #718096; font-size: 13px;">
            This link expires in 72 hours. If you did not expect this email, please contact us.
          </p>
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          Mauritius Offshore Client Portal | 365 Royal Road, Rose Hill, Mauritius | +230 454 9670
        </div>
      </div>
    `,
  });

  if (emailError) {
    return NextResponse.json({ error: `Failed to send email: ${emailError.message}` }, { status: 500 });
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("kyc_records")
    .update({
      invite_sent_at: sentAt,
      invite_sent_by: session.user.id,
    })
    .eq("id", params.id);

  return NextResponse.json({ success: true, sentAt });
}
