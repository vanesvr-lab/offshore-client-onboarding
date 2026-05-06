-- B-059 — One active client_profiles row per (tenant_id, lower(email)).
--
-- Partial index so:
-- - Soft-deleted rows (is_deleted = true) are exempt — past duplicates
--   that were cleaned up don't need to be hard-deleted.
-- - Profiles without an email (e.g., company secretary added on the fly
--   before email is known) are exempt — adding email later is the
--   trigger for uniqueness.
--
-- Lowercase the email so "Foo@bar.com" and "foo@bar.com" can't both
-- coexist (matches how the API already normalizes elsewhere).
--
-- Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS client_profiles_tenant_email_uq
  ON public.client_profiles (tenant_id, lower(email))
  WHERE is_deleted = false AND email IS NOT NULL AND email <> '';
