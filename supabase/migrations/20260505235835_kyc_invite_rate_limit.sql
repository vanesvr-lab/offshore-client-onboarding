-- B-067 §6.1 — Per-profile / per-service invite rate limit (3 invites per 24h).
--
-- Existing rate-limiting was a single 24h cooldown after the most recent
-- invite (server-side check on profile_service_roles.invite_sent_at). The
-- product requirement is now 3 invites per profile/service pair per rolling
-- 24h window before the 4th is blocked.
--
-- We track the count + window start on profile_service_roles (the same row
-- that already holds invite_sent_at / invite_sent_by). Idempotent.

ALTER TABLE profile_service_roles
  ADD COLUMN IF NOT EXISTS invites_sent_count_24h integer NOT NULL DEFAULT 0;

ALTER TABLE profile_service_roles
  ADD COLUMN IF NOT EXISTS invites_count_window_start timestamptz NULL;

COMMENT ON COLUMN profile_service_roles.invites_sent_count_24h IS
  'Count of invites sent in the current rolling 24h window. Reset to 1 when the window first opens or rolls over. Cap is 3 per window for non-admins.';

COMMENT ON COLUMN profile_service_roles.invites_count_window_start IS
  'Timestamp when the current rolling 24h invite window opened. NULL means no invites have ever been sent for this role row.';
