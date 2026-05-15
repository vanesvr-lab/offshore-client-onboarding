-- B-120 — Reference Forms library.
--
-- Two tables:
--   • reference_forms  — blank regulatory templates, scoped to a
--     (service_template_id, action_key) pair. Replace-with-new-version
--     flow deactivates the old row and links replaced_by_id forward.
--   • submitted_forms  — filled copies admin uploads back per service.
--     History preserved per (service_id, action_key, reference_form_id);
--     the latest row by uploaded_at is the "current" submitted form.
--
-- RLS: deny-by-default. All app reads/writes go through service role
-- (createAdminClient). Routes gate on session.user.role === "admin".
-- Mirrors the pattern used in review_requests and application_section_reviews.

CREATE TABLE IF NOT EXISTS public.reference_forms (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                          REFERENCES public.tenants(id),
  service_template_id   uuid NOT NULL REFERENCES public.service_templates(id) ON DELETE CASCADE,
  action_key            text NOT NULL,
  name                  text NOT NULL,
  file_path             text NOT NULL,
  source_url            text,
  version_label         text,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'deactivated')),
  deactivated_reason    text
                          CHECK (deactivated_reason IS NULL OR deactivated_reason IN
                                 ('no_longer_required', 'replaced_by_newer_version')),
  deactivated_at        timestamptz,
  deactivated_note      text,
  replaced_by_id        uuid REFERENCES public.reference_forms(id) ON DELETE SET NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_reference_forms_lookup
  ON public.reference_forms (service_template_id, action_key, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_reference_forms_tenant
  ON public.reference_forms (tenant_id);

CREATE TABLE IF NOT EXISTS public.submitted_forms (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                          REFERENCES public.tenants(id),
  service_id            uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  action_key            text NOT NULL,
  reference_form_id     uuid NOT NULL REFERENCES public.reference_forms(id) ON DELETE RESTRICT,
  file_path             text NOT NULL,
  file_name             text NOT NULL,
  notes                 text,
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  uploaded_by           uuid NOT NULL REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_submitted_forms_lookup
  ON public.submitted_forms (service_id, action_key, reference_form_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_submitted_forms_tenant
  ON public.submitted_forms (tenant_id);

ALTER TABLE public.reference_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submitted_forms ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.reference_forms IS
  'B-120 — blank regulatory templates per (service_template, action_key). Active rows are downloaded; deactivated rows persist for audit. replaced_by_id chains to newer versions.';
COMMENT ON TABLE public.submitted_forms IS
  'B-120 — filled-and-submitted copies admin uploads back per service. History preserved; the latest row per (service_id, action_key, reference_form_id) is the current submission.';
COMMENT ON COLUMN public.reference_forms.action_key IS
  'substance_review | bank_account_opening | company_registration | fsc_checklist — matches service_actions.action_key.';
COMMENT ON COLUMN public.reference_forms.deactivated_reason IS
  'no_longer_required (admin deactivated) | replaced_by_newer_version (Replace flow).';
