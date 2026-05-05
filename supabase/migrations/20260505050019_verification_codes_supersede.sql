-- B-056 §1.2 / §1.3 — Magic-link KYC invite collision + missing-profile fix
--
-- Two bugs in the existing magic-link flow:
--
--   A. send-invite was DELETE-by-email then INSERT, so a user with multiple
--      roles on the same service (or any resend) lost their first link the
--      moment a second invite went out. Old token → 404 "Invalid or
--      expired link".
--   B. verify-code's returnKycData looked up `kyc_records.id =
--      vc.kyc_record_id`, but send-invite never populated kyc_record_id
--      (the comment even said so). Every fresh invite returned 404
--      "Profile not found" after a correct code entry. The codebase
--      already has `verification_codes.client_profile_id` (added in
--      migration 003) — it just wasn't being written or read.
--
-- This migration adds:
--   1. `superseded_at timestamptz` so we can mark an old token as replaced
--      by a newer invite (instead of deleting + losing audit), and surface
--      a clear "your invite was updated" 410 in verify-code.
--   2. A unique partial index that enforces one active (unverified +
--      not-superseded) invite per (email, client_profile_id) pair.
--   3. A plain index on (access_token) — verify-code looks up by token on
--      every request, the index keeps the lookup hot.
--
-- All changes are additive: existing rows continue to work, no data
-- migration needed.

ALTER TABLE public.verification_codes
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS verification_codes_email_profile_active_uq
  ON public.verification_codes (email, client_profile_id)
  WHERE verified_at IS NULL AND superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verification_codes_token
  ON public.verification_codes (access_token);
