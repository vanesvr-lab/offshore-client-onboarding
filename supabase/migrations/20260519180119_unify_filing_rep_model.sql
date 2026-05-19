-- B-134 — Unify the representative model. Replace B-131's
-- filing_rep_name + filing_rep_email text columns with a proper FK
-- to a client_profiles row (where is_representative = true).

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS filing_rep_profile_id uuid
    REFERENCES public.client_profiles(id);

CREATE INDEX IF NOT EXISTS client_profiles_filing_rep_idx
  ON public.client_profiles(filing_rep_profile_id)
  WHERE filing_rep_profile_id IS NOT NULL;

-- Backfill: for each director with a filing_rep_email set, find or
-- create the matching rep profile and write the FK.
DO $$
DECLARE
  r RECORD;
  rep_id uuid;
BEGIN
  FOR r IN
    SELECT id, tenant_id, filing_rep_name, filing_rep_email
    FROM public.client_profiles
    WHERE filing_rep_email IS NOT NULL
      AND filing_rep_profile_id IS NULL
  LOOP
    -- Try to find an existing rep profile in the same tenant by email
    SELECT cp.id INTO rep_id
    FROM public.client_profiles cp
    WHERE cp.tenant_id = r.tenant_id
      AND lower(cp.email) = lower(r.filing_rep_email)
      AND cp.is_representative = true
      AND cp.is_deleted = false
    LIMIT 1;

    -- Create one if not found
    IF rep_id IS NULL THEN
      INSERT INTO public.client_profiles (
        tenant_id, full_name, email, record_type, is_representative,
        due_diligence_level
      )
      VALUES (
        r.tenant_id, r.filing_rep_name, r.filing_rep_email,
        'individual', true, 'cdd'
      )
      RETURNING id INTO rep_id;
    END IF;

    UPDATE public.client_profiles
    SET filing_rep_profile_id = rep_id
    WHERE id = r.id;
  END LOOP;
END $$;

-- Summary audit row for the backfill
INSERT INTO public.audit_log (
  actor_role, action, entity_type, entity_id,
  previous_value, new_value
) VALUES (
  'system',
  'filing_rep_model_unified_backfill',
  'migration',
  gen_random_uuid(),
  jsonb_build_object('migration', 'B-134'),
  jsonb_build_object(
    'linked_count', (
      SELECT count(*) FROM public.client_profiles
      WHERE filing_rep_profile_id IS NOT NULL
    )
  )
);

-- Drop legacy text columns. Constraint from B-131 also goes.
ALTER TABLE public.client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_filing_rep_consistency;
ALTER TABLE public.client_profiles
  DROP COLUMN IF EXISTS filing_rep_name,
  DROP COLUMN IF EXISTS filing_rep_email;

-- Drop the lookup index from B-131 (no longer needed; replaced by
-- the FK-based query path in Batch 4)
DROP INDEX IF EXISTS client_profiles_filing_rep_email_idx;
