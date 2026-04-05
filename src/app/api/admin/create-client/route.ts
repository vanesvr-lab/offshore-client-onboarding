import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(request: Request) {
  // Verify the caller is an admin
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: adminRecord } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRecord) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { company_name, full_name, email, phone } = await request.json();

  if (!company_name || !full_name || !email) {
    return NextResponse.json({ error: "company_name, full_name and email are required" }, { status: 400 });
  }

  // 1. Create the Supabase Auth user (no password — they'll set one via the link)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }
  const newUserId = authData.user.id;

  // 2. Upsert profile (trigger auto-creates it, but ensure full_name + phone are set)
  await supabase.from("profiles").upsert({
    id: newUserId,
    full_name,
    email,
    phone: phone || null,
  });

  // 3. Create the client company
  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .insert({ company_name })
    .select()
    .single();
  if (clientError) {
    await supabase.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  // 4. Associate user with company as owner
  const { error: cuError } = await supabase
    .from("client_users")
    .insert({ client_id: clientData.id, user_id: newUserId, role: "owner" });
  if (cuError) {
    await supabase.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: cuError.message }, { status: 500 });
  }

  // 5. Generate a password-setup link (recovery type = set new password)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002";
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${appUrl}/auth/callback?type=recovery`,
    },
  });
  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  // 6. Send branded welcome email via Resend
  await resend.emails.send({
    from: `GWMS Ltd <${process.env.RESEND_FROM_EMAIL!}>`,
    to: email,
    subject: "Welcome to GWMS — Set up your account",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">GWMS Ltd</h1>
          <p style="color: #90cdf4; margin: 6px 0 0; font-size: 13px;">Beyond Entities, Building Legacies</p>
        </div>
        <div style="padding: 36px; background: #ffffff;">
          <p style="color: #1a365d; font-size: 16px; margin: 0 0 12px;">Dear ${full_name},</p>
          <p style="color: #4a5568; font-size: 14px; line-height: 1.6;">
            Your GWMS client account has been created for <strong>${company_name}</strong>.
            Please click the button below to set your password and access your onboarding portal.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${linkData.properties.action_link}"
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
          GWMS Ltd | 365 Royal Road, Rose Hill, Mauritius | +230 454 9670
        </div>
      </div>
    `,
  });

  return NextResponse.json({ success: true, clientId: clientData.id });
}
