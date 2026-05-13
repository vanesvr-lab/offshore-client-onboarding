-- B-098 — Service status overhaul. Old 8-value enum replaced by
-- 10 new values: 8 forward chain + 2 override-only terminals.
--   Forward: start → document_collection → verification_and_screening
--            → risk_assessment → final_review → approved → registration
--            → active
--   Override-only terminals: rejected, closed
--
-- Existing services are reset to 'start' (Vanessa's call: single test
-- service that she'll move manually after migration lands). Historical
-- audit_log entries referencing old status values stay as-is — they're
-- the record of what actually happened at that point in time.

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.services'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.services DROP CONSTRAINT %I',
      cons_name
    );
  END IF;
END $$;

UPDATE public.services SET status = 'start';

ALTER TABLE public.services
  ALTER COLUMN status SET DEFAULT 'start';

ALTER TABLE public.services
  ADD CONSTRAINT services_status_check
  CHECK (status IN (
    'start',
    'document_collection',
    'verification_and_screening',
    'risk_assessment',
    'final_review',
    'approved',
    'registration',
    'active',
    'rejected',
    'closed'
  ));
