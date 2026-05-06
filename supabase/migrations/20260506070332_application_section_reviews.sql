-- B-068 — Per-section admin review workflow
--
-- Track admin reviews per wizard section. History-preserving: every save
-- inserts a NEW row. Latest row per (application_id, section_key) is the
-- current status. Older rows are the audit trail shown at the bottom of
-- each section.
--
-- Reviews are advisory only — they never block stage progression,
-- application submission, or any existing flow.
--
-- RLS: enabled, no policies (matches project default-deny model — see
-- migration 005 / tech-debt #3). All access goes through
-- `createAdminClient()` server-side; the route handlers gate on
-- `session.user.role === "admin"` (NextAuth, not Supabase Auth).

CREATE TABLE IF NOT EXISTS public.application_section_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                    REFERENCES public.tenants(id),
  application_id  uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  section_key     text NOT NULL,
  status          text NOT NULL CHECK (status IN ('approved','flagged','rejected')),
  notes           text,
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asr_app_idx     ON public.application_section_reviews(application_id);
CREATE INDEX IF NOT EXISTS asr_app_key_idx ON public.application_section_reviews(application_id, section_key, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS asr_tenant_idx  ON public.application_section_reviews(tenant_id);

ALTER TABLE public.application_section_reviews ENABLE ROW LEVEL SECURITY;
