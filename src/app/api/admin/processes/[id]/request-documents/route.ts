import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { processDocumentIds, message } = await request.json() as {
    processDocumentIds: string[];
    message?: string;
  };

  if (!processDocumentIds?.length) {
    return NextResponse.json({ error: "processDocumentIds required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the client_process with client info
  const { data: proc } = await supabase
    .from("client_processes")
    .select(`
      id, client_id,
      process_templates(name),
      clients:client_id(company_name,
        client_users(profiles!client_users_user_id_fkey(email, full_name))
      )
    `)
    .eq("id", params.id)
    .single();

  if (!proc) return NextResponse.json({ error: "Process not found" }, { status: 404 });

  // Fetch the requested process_documents with document type names
  const { data: processDocs } = await supabase
    .from("process_documents")
    .select(`
      id,
      process_requirements:requirement_id(
        document_types(name)
      )
    `)
    .in("id", processDocumentIds);

  const docNames = (processDocs ?? []).map((pd) => {
    const req = pd.process_requirements as unknown as { document_types?: { name?: string } } | null;
    return req?.document_types?.name ?? "Unknown document";
  });

  // Update process_documents to requested
  const now = new Date().toISOString();
  await supabase
    .from("process_documents")
    .update({ status: "requested", requested_at: now })
    .in("id", processDocumentIds);

  // Get client email from first owner
  const clientData = proc.clients as unknown as {
    company_name: string;
    client_users: Array<{ profiles?: { email?: string; full_name?: string } | null }>;
  } | null;

  const ownerEmail = clientData?.client_users?.[0]?.profiles?.email;
  if (!ownerEmail) {
    return NextResponse.json({ success: true, emailSent: false, reason: "No client email found" });
  }

  const templateName = (proc.process_templates as unknown as { name?: string })?.name ?? "Process";
  const docList = docNames.map((n) => `• ${n}`).join("\n");
  const customMsg = message ? `\n\n${message}` : "";

  await resend.emails.send({
    from: `Mauritius Offshore Client Portal <${process.env.RESEND_FROM_EMAIL!}>`,
    to: ownerEmail,
    subject: `Documents required — ${templateName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a365d; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Mauritius Offshore Client Portal</h1>
        </div>
        <div style="padding: 30px; background: #ffffff;">
          <p>Dear ${clientData?.company_name ?? "Client"},</p>
          <p>To progress your <strong>${templateName}</strong>, we require the following documents:</p>
          <pre style="background:#f7fafc;padding:12px;border-radius:6px;font-size:14px;">${docList}</pre>
          ${customMsg ? `<p>${customMsg.replace(/\n/g, "<br>")}</p>` : ""}
          <p>Please upload the documents via your client portal.</p>
          <p>If you have any questions, please contact your account manager.</p>
        </div>
        <div style="padding: 20px; background: #f7fafc; text-align: center; font-size: 12px; color: #718096;">
          Mauritius Offshore Client Portal | 365 Royal Road, Rose Hill, Mauritius | +230 454 9670
        </div>
      </div>
    `,
  });

  return NextResponse.json({ success: true, emailSent: true });
}
