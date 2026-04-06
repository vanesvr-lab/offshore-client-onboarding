import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const resend = new Resend(process.env.RESEND_API_KEY!);

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  applicationId: string;
  sentBy: string;
}

export async function sendClientEmail({
  to,
  subject,
  body,
  applicationId,
  sentBy,
}: SendEmailParams) {
  const supabase = createAdminClient();

  const { data, error } = await resend.emails.send({
    from: `Mauritius Offshore Client Portal <${process.env.RESEND_FROM_EMAIL!}>`,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Mauritius Offshore Client Portal</h1>
          <p style="color: #90cdf4; margin: 4px 0 0; font-size: 12px;">Beyond Entities, Building Legacies</p>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          ${body.replace(/\n/g, "<br>")}
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          Mauritius Offshore Client Portal | 365 Royal Road, Rose Hill, Mauritius | +230 454 9670
        </div>
      </div>
    `,
  });

  // Log regardless of success/failure
  await supabase.from("email_log").insert({
    application_id: applicationId,
    sent_by: sentBy,
    to_email: to,
    subject,
    body,
    resend_id: data?.id || null,
  });

  if (error) throw new Error(error.message);
  return data;
}
