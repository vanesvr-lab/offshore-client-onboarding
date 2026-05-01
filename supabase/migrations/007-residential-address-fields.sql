-- B-049 Batch 2 — Break the single `address` text field into structured
-- residential-address fields so the wizard can:
--   1. Show address as its own sub-step (split from Identity).
--   2. Auto-fill each field from the structured POA extraction.
--
-- The legacy `address` column stays — we keep it as a derived "free text"
-- view of the structured fields so older queries (and admin views that read
-- it directly) continue working.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.kyc_records
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS address_city   text,
  ADD COLUMN IF NOT EXISTS address_state  text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_country text;

ALTER TABLE public.client_profile_kyc
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS address_city   text,
  ADD COLUMN IF NOT EXISTS address_state  text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_country text;
