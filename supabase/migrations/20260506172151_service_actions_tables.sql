-- B-072 Batch 1 — Admin actions registry per service.
--
-- (Supersedes empty stub 20260506172057_service_actions.sql which was
-- accidentally pushed before SQL was written. Idempotent guards keep
-- this safe to re-run.)
--
-- Two tables:
--   • service_template_actions — which actions a template requires (binding)
--   • service_actions          — per-service action instances (status + audit)
--
-- Service-scoped (FK to services.id). DO NOT name columns application_id —
-- avoiding the misleading naming from application_section_reviews
-- (tech debt #26).

CREATE TABLE IF NOT EXISTS public.service_template_actions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                            REFERENCES public.tenants(id),
  service_template_id     uuid NOT NULL REFERENCES public.service_templates(id) ON DELETE CASCADE,
  action_key              text NOT NULL,
  action_label            text NOT NULL,
  is_required             boolean NOT NULL DEFAULT true,
  sort_order              int NOT NULL DEFAULT 0,
  UNIQUE (service_template_id, action_key)
);

CREATE TABLE IF NOT EXISTS public.service_actions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                            REFERENCES public.tenants(id),
  service_id              uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  action_key              text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'done', 'blocked', 'not_applicable')),
  assigned_to             uuid REFERENCES public.profiles(id),
  completed_by            uuid REFERENCES public.profiles(id),
  completed_at            timestamptz,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, action_key)
);

CREATE INDEX IF NOT EXISTS sa_svc_idx       ON public.service_actions(service_id);
CREATE INDEX IF NOT EXISTS sa_status_idx    ON public.service_actions(status);
CREATE INDEX IF NOT EXISTS sta_template_idx ON public.service_template_actions(service_template_id);

ALTER TABLE public.service_template_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_actions          ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_template_actions' AND policyname = 'sta_admin_all'
  ) THEN
    CREATE POLICY "sta_admin_all" ON public.service_template_actions FOR ALL USING (public.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_template_actions' AND policyname = 'sta_read'
  ) THEN
    CREATE POLICY "sta_read" ON public.service_template_actions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_actions' AND policyname = 'sa_admin_all'
  ) THEN
    CREATE POLICY "sa_admin_all" ON public.service_actions FOR ALL USING (public.is_admin());
  END IF;
END$$;

-- Seed: GBC and AC service templates get all three admin actions. Match by
-- name pattern (the seeded templates are "Global Business Corporation (GBC)"
-- and "Authorised Company (AC)"). ON CONFLICT preserves manual edits.

INSERT INTO public.service_template_actions (service_template_id, action_key, action_label, sort_order)
SELECT id, 'substance_review',     'Substance Review',     1 FROM public.service_templates
WHERE name ILIKE '%global business%' OR name ILIKE '%authorised company%'
ON CONFLICT (service_template_id, action_key) DO NOTHING;

INSERT INTO public.service_template_actions (service_template_id, action_key, action_label, sort_order)
SELECT id, 'bank_account_opening', 'Bank Account Opening', 2 FROM public.service_templates
WHERE name ILIKE '%global business%' OR name ILIKE '%authorised company%'
ON CONFLICT (service_template_id, action_key) DO NOTHING;

INSERT INTO public.service_template_actions (service_template_id, action_key, action_label, sort_order)
SELECT id, 'fsc_checklist',        'Generate FSC Checklist', 3 FROM public.service_templates
WHERE name ILIKE '%global business%' OR name ILIKE '%authorised company%'
ON CONFLICT (service_template_id, action_key) DO NOTHING;
