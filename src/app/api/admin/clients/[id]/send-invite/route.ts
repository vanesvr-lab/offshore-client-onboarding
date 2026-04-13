import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { SignJWT } from "jose";

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

  const { data: emailResult, error: emailError } = await resend.emails.send({
    from: `Mauritius Offshore Client Portal <${process.env.RESEND_FROM_EMAIL!}>`,
    to: email!,
    subject: "Welcome to Mauritius Offshore Client Portal — Set up your account",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Mauritius Offshore Client Portal</h1>
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
          Mauritius Offshore Client Portal | 365 Royal Road, Rose Hill, Mauritius | +230 454 9670
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

  await supabase
    .from("clients")
    .update({ invite_sent_at: new Date().toISOString() })
    .eq("id", params.id);

  revalidatePath(`/admin/clients/${params.id}`);
  return NextResponse.json({ success: true, emailId: emailResult?.id });
}
