-- B-049 Batch 1 — Add `scope` flag to document_types so the wizard can route
-- each doc to the right place:
--   - 'person'      → uploaded for each Director / Shareholder / UBO inside
--                     the per-person KYC wizard (Identity / Financial / etc.)
--   - 'application' → uploaded once for the entity inside Step 5 of the
--                     outer wizard (Documents).
--
-- Runs idempotently. Safe to re-run.

ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'person'
    CHECK (scope IN ('person', 'application'));

-- Initial backfill: if a doc type explicitly only `applies_to = 'organisation'`
-- treat it as an application-level doc. Everything else (individual / both)
-- stays at the per-person scope, matching the brief's "default = person" rule.
UPDATE public.document_types
   SET scope = 'application'
 WHERE applies_to = 'organisation'
   AND scope = 'person';

-- Make sure the wizard read paths can find the column quickly.
CREATE INDEX IF NOT EXISTS document_types_scope_idx ON public.document_types(scope);
