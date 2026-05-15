-- B-118 — Relax legacy NOT NULL on verification_codes.kyc_record_id so the
-- modern admin invite path (`/api/services/[id]/persons/[roleId]/send-invite`)
-- can insert with `client_profile_id` only.
--
-- Already applied in prod via the Supabase SQL editor; this migration
-- formalises the change so the supabase migration tracker matches the
-- live schema. `DROP NOT NULL` on a column that's already nullable is a
-- no-op, so this is fully idempotent.
--
-- The legacy `/api/admin/profiles/[id]/send-invite` route still provides
-- a `kyc_record_id` when invoked, so its behaviour is unchanged. Cleanup
-- of the legacy path is tracked in tech-debt #28.

ALTER TABLE verification_codes ALTER COLUMN kyc_record_id DROP NOT NULL;
