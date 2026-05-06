-- B-074 — Re-drop application_section_reviews.application_id FK.
-- The previous attempt (20260506155512) was tracked as applied but the
-- constraint survived in prod. Live insert tests still fail with 23503.
-- This migration is fully idempotent: if the constraint is already gone,
-- it's a no-op.

ALTER TABLE public.application_section_reviews
  DROP CONSTRAINT IF EXISTS application_section_reviews_application_id_fkey;
