-- B-100 — Waive a per-profile KYC document requirement.
--
-- The KycDocumentsTable (B-097) renders one row per
-- (client_profile × document_type) pair. Admin clicks Waive on a row →
-- waived row appears here → client portal upload list filters it out.
-- Reversible via DELETE (un-waive). No "reason" column — Vanessa
-- explicitly said "just a modal", and both actions are audit-logged.
--
-- Key shape: we key on `client_profile_id + service_id + document_type_id`
-- rather than the `(client_profile_kyc_id, document_category)` shape from
-- the brief because the KycDocumentsTable rows are themselves keyed on
-- (profile_id, doc_type_id) — same granularity, no surprise mismatches
-- across categories that map to multiple doc types, and the FK chain
-- stays inside columns the API actually receives.

CREATE TABLE IF NOT EXISTS public.waived_document_requirements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                        REFERENCES public.tenants(id),
  client_profile_id   uuid NOT NULL
                        REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  service_id          uuid NOT NULL
                        REFERENCES public.services(id) ON DELETE CASCADE,
  document_type_id    uuid NOT NULL
                        REFERENCES public.document_types(id) ON DELETE CASCADE,
  waived_at           timestamptz NOT NULL DEFAULT now(),
  waived_by           uuid NOT NULL REFERENCES public.users(id),
  UNIQUE (client_profile_id, service_id, document_type_id)
);

CREATE INDEX IF NOT EXISTS idx_waived_doc_reqs_profile
  ON public.waived_document_requirements(client_profile_id);
CREATE INDEX IF NOT EXISTS idx_waived_doc_reqs_service
  ON public.waived_document_requirements(service_id);

ALTER TABLE public.waived_document_requirements ENABLE ROW LEVEL SECURITY;
-- App talks to this table through the service-role admin client only,
-- mirroring how `application_section_reviews` is gated. No anon-key
-- policies — default-deny RLS keeps PostgREST honest.

NOTIFY pgrst, 'reload schema';
