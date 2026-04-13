import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY!);

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Fetch the KYC record
  const { data: record, error: recErr } = await supabase
    .from("kyc_records")
    .select("id, email, full_name, is_primary, client_id, clients(company_name)")
    .eq("id", params.id)
    .single();

  if (recErr || !record) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (!record.email) {
    return NextResponse.json({ error: "Profile has no email — add an email first" }, { status: 400 });
  }

  if (record.is_primary) {
    return NextResponse.json({ error: "Primary profile invites use the main invite flow" }, { status: 400 });
  }

  const companyName =
    (record.clients as unknown as { company_name?: string } | null)?.company_name ?? "the company";

  // Generate access token and verification code
  const accessToken = generateToken();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72 hours

  // Invalidate any existing codes for this KYC record
  await supabase
    .from("verification_codes")
    .delete()
    .eq("kyc_record_id", record.id);

  // Insert new verification code
  const { error: codeErr } = await supabase
    .from("verification_codes")
    .insert({
      kyc_record_id: record.id,
      access_token: accessToken,
      code,
      email: record.email,
      expires_at: expiresAt,
    });

  if (codeErr) {
    return NextResponse.json({ error: "Failed to create verification code" }, { status: 500 });
  }

  // Build the access URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const accessUrl = `${baseUrl}/kyc/fill/${accessToken}`;

  // Send email with code + link
  const { error: emailError } = await resend.emails.send({
    from: `GWMS Client Portal <${process.env.RESEND_FROM_EMAIL!}>`,
    to: record.email,
    subject: `Complete your KYC profile — ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">GWMS Client Portal</h1>
          <p style="color: #90cdf4; margin: 6px 0 0; font-size: 13px;">KYC / AML Compliance Portal</p>
        </div>
        <div style="padding: 36px; background: #ffffff;">
          <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">Dear ${record.full_name ?? ""},</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            You have been added as a profile for <strong>${companyName}</strong>. Please complete your personal KYC information by clicking the link below.
          </p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            When you open the link, you'll be asked to enter this verification code:
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
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          GWMS Client Portal | Mauritius
        </div>
      </div>
    `,
  });

  if (emailError) {
    // Clean up the verification code
    await supabase.from("verification_codes").delete().eq("access_token", accessToken);
    return NextResponse.json({ error: `Failed to send email: ${emailError.message}` }, { status: 500 });
  }

  // Update invite tracking
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
