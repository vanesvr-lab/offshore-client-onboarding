// B-108 Batch 1 — Communications log writer.
//
// Best-effort write to `service_communications` after an outbound email
// sends successfully. The email already left the building when this
// runs, so a log failure should never block or surface to the caller —
// just record it and move on.
//
// Wired from every Resend send path:
//   - /api/admin/clients/[id]/send-invite           (client_signup_invite)
//   - /api/admin/profiles/[id]/send-invite          (profile_kyc_invite)
//   - /api/services/[id]/persons/[roleId]/send-invite (service_kyc_invite)
//   - /api/admin/documents/[id]/request-update      (document_update_request)
//   - /api/admin/processes/[id]/request-documents   (process_documents_request)

import { createAdminClient } from "@/lib/supabase/admin";

export type EmailType =
  | "client_signup_invite"
  | "profile_kyc_invite"
  | "service_kyc_invite"
  | "document_update_request"
  | "process_documents_request";

export interface LogCommunicationInput {
  serviceId: string;
  tenantId: string;
  sentBy: string | null;
  sentByName: string | null;
  sentToEmail: string | null;
  sentToProfileId: string | null;
  emailType: EmailType | string;
  subject: string;
  bodyHtml: string;
  relatedEntityType?: "document" | "profile" | "service" | null;
  relatedEntityId?: string | null;
  resendMessageId?: string | null;
  status?: "sent" | "failed";
}

export async function logCommunication(input: LogCommunicationInput): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("service_communications").insert({
      tenant_id: input.tenantId,
      service_id: input.serviceId,
      sent_by: input.sentBy,
      sent_by_name: input.sentByName,
      sent_to_email: input.sentToEmail,
      sent_to_profile_id: input.sentToProfileId,
      email_type: input.emailType,
      subject: input.subject,
      body_html: input.bodyHtml,
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
      resend_message_id: input.resendMessageId ?? null,
      status: input.status ?? "sent",
    });
    if (error) {
      console.error("[logCommunication] insert failed:", error);
    }
  } catch (err) {
    console.error("[logCommunication] unexpected error:", err);
  }
}
