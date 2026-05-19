-- B-132 — Personal KYC documents follow the profile, not the service.
-- Make service_id nullable; backfill all existing personal-category
-- docs to service_id = NULL so they surface on every service the
-- profile is on.

ALTER TABLE public.documents
  ALTER COLUMN service_id DROP NOT NULL;

-- Backfill: every active doc whose document_type.category is personal
-- gets service_id = NULL. Categories: identity, financial, compliance.
UPDATE public.documents d
SET service_id = NULL
FROM public.document_types dt
WHERE d.document_type_id = dt.id
  AND dt.category IN ('identity', 'financial', 'compliance')
  AND d.service_id IS NOT NULL;

-- Audit log entry — one summary row (not per-doc, to avoid flooding
-- the log) with the post-backfill count of profile-scoped docs.
INSERT INTO public.audit_log (
  actor_role, action, entity_type, entity_id,
  previous_value, new_value
)
SELECT
  'system',
  'documents_profile_scoped_backfill',
  'migration',
  gen_random_uuid(),
  jsonb_build_object('migration', 'B-132'),
  jsonb_build_object(
    'backfilled_count', (
      SELECT count(*) FROM public.documents d2
      JOIN public.document_types dt2 ON d2.document_type_id = dt2.id
      WHERE dt2.category IN ('identity', 'financial', 'compliance')
        AND d2.service_id IS NULL
    )
  );

-- Index to speed up the profile-scoped query (load docs by profile
-- where service_id IS NULL).
CREATE INDEX IF NOT EXISTS documents_profile_scoped_idx
  ON public.documents(client_profile_id)
  WHERE service_id IS NULL AND is_active = true;
