-- B-073 — Drop FK from application_section_reviews.application_id → applications(id)
--
-- The column now holds either an applications.id (legacy admin path) or a
-- services.id (modern admin path). Both ID spaces are uuid v4, so collisions
-- are statistically zero, but the FK constraint blocks service-id inserts.
--
-- Tracked as tech-debt #26 (CHANGES.md): rename column to subject_id once
-- the legacy applications table + /admin/applications/[id] route are
-- retired, and add a polymorphic subject_type discriminator.
--
-- ON DELETE CASCADE behavior is lost for application rows, but the legacy
-- applications table is heading for retirement and section-review rows are
-- advisory-only — orphaned rows are tolerable until the rename.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.application_section_reviews'::regclass
      AND conname  = 'application_section_reviews_application_id_fkey'
  ) THEN
    ALTER TABLE public.application_section_reviews
      DROP CONSTRAINT application_section_reviews_application_id_fkey;
  END IF;
END$$;
