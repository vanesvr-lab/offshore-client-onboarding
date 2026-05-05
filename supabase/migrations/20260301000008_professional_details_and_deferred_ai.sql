-- B-049 Batch 3 — Manual professional details + deferred AI verification.
--
-- 1. Add structured professional-detail columns to the KYC tables so the
--    new Professional Details sub-step has somewhere to land its values.
--    All optional / nullable.
-- 2. Add `ai_deferred` boolean to document_types so the upload route knows
--    not to run AI verification at upload time. The wizard re-triggers AI
--    once the cross-form context (applicant name, declared occupation, …)
--    is available.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.kyc_records
  ADD COLUMN IF NOT EXISTS employer                text,
  ADD COLUMN IF NOT EXISTS years_in_role           int,
  ADD COLUMN IF NOT EXISTS years_total_experience  int,
  ADD COLUMN IF NOT EXISTS industry                text,
  ADD COLUMN IF NOT EXISTS source_of_funds_type    text,
  ADD COLUMN IF NOT EXISTS source_of_funds_other   text;

ALTER TABLE public.client_profile_kyc
  ADD COLUMN IF NOT EXISTS employer                text,
  ADD COLUMN IF NOT EXISTS years_in_role           int,
  ADD COLUMN IF NOT EXISTS years_total_experience  int,
  ADD COLUMN IF NOT EXISTS industry                text,
  ADD COLUMN IF NOT EXISTS source_of_funds_type    text,
  ADD COLUMN IF NOT EXISTS source_of_funds_other   text;

-- B-049 §3.2 — when true, document uploads of this type skip the
-- fire-and-forget AI verification on upload; the wizard's "Save & Continue"
-- handler re-runs it with the full cross-form context. Defaults to false to
-- preserve existing per-doc-type behaviour for everything that wasn't
-- flagged.
ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS ai_deferred boolean NOT NULL DEFAULT false;
