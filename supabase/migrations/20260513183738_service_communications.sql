-- B-108 Batch 1 — Communications log.
--
-- Every outbound email from Resend writes a row here (best-effort —
-- the calling endpoint never blocks on the log). Right-rail card on
-- /admin/services/[id] reads from this to show what's been sent and
-- the full HTML body via a sandboxed iframe.
--
-- Track-from-now: no backfill of historical sends.

CREATE TABLE IF NOT EXISTS public.service_communications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                        REFERENCES public.tenants(id),
  service_id          uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  sent_by             uuid REFERENCES public.users(id),
  sent_by_name        text,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  sent_to_email       text,
  sent_to_profile_id  uuid REFERENCES public.client_profiles(id) ON DELETE SET NULL,
  -- Open-text email_type so new email categories don't need a migration.
  -- Known values from B-108 batch 1 wiring:
  --   client_signup_invite | profile_kyc_invite | service_kyc_invite
  --   | document_update_request | process_documents_request
  email_type          text NOT NULL,
  subject             text NOT NULL,
  body_html           text NOT NULL,
  related_entity_type text,
  related_entity_id   uuid,
  resend_message_id   text,
  status              text NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_comms_service
  ON public.service_communications(service_id);
CREATE INDEX IF NOT EXISTS idx_comms_service_time
  ON public.service_communications(service_id, sent_at DESC);

ALTER TABLE public.service_communications ENABLE ROW LEVEL SECURITY;
-- App talks via service-role only, same pattern as audit_log + waivers.

NOTIFY pgrst, 'reload schema';
