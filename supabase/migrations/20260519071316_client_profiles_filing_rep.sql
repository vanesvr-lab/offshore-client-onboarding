-- B-131 — Filing representative delegation. When a director's KYC
-- paperwork is filed by someone else (corporate secretary, lawyer,
-- accountant, etc.), capture the rep's name + email on the profile.
-- The rep logs in with that email to access the profile's KYC form.

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS filing_rep_name  text,
  ADD COLUMN IF NOT EXISTS filing_rep_email text;

-- Lookup index: at login time, query "give me every profile where
-- filing_rep_email = my email". This needs to be fast.
CREATE INDEX IF NOT EXISTS client_profiles_filing_rep_email_idx
  ON public.client_profiles(lower(filing_rep_email))
  WHERE filing_rep_email IS NOT NULL;

-- Validation: if email is set, name should be too (UI enforces, but
-- belt-and-suspenders here).
ALTER TABLE public.client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_filing_rep_consistency;
ALTER TABLE public.client_profiles
  ADD CONSTRAINT client_profiles_filing_rep_consistency
  CHECK (
    (filing_rep_name IS NULL AND filing_rep_email IS NULL)
    OR (filing_rep_name IS NOT NULL AND filing_rep_email IS NOT NULL)
  );
