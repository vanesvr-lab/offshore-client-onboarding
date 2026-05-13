-- B-098 — Section reviews: rename status value 'approved' → 'reviewed'.
-- Clicking the Review button on a section card means a reviewer has
-- *reviewed* the section (Vanessa's term), not that anyone *approved*
-- anything. Approval is a different concept tied to the service-level
-- status.
--
-- Drop the existing CHECK constraint (auto-discovered by name),
-- migrate rows, then re-add with the new allowed list.

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.application_section_reviews'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.application_section_reviews DROP CONSTRAINT %I',
      cons_name
    );
  END IF;
END $$;

UPDATE public.application_section_reviews
  SET status = 'reviewed'
  WHERE status = 'approved';

ALTER TABLE public.application_section_reviews
  ADD CONSTRAINT application_section_reviews_status_check
  CHECK (status IN ('reviewed', 'flagged', 'rejected'));
