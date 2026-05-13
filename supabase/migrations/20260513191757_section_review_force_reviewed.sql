-- B-110 — track when admin marks a section reviewed despite incomplete fields.
-- `SectionReviewPanel` enforces a Force-review checkbox + non-empty notes when
-- this column is `true` so the audit trail captures the override + the reason.

ALTER TABLE public.application_section_reviews
  ADD COLUMN IF NOT EXISTS force_reviewed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.application_section_reviews.force_reviewed IS
  'B-110 — true when admin marked a section reviewed despite incomplete fields. Forces a notes-required + override-checkbox flow in SectionReviewPanel.';
