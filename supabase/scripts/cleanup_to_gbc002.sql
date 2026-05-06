-- ============================================================================
-- Cleanup to GBC-0002 only
-- ============================================================================
-- Purpose: hard-delete all test data EXCEPT the GBC-0002 service chain and
--          the 4 auth users we still need (3 admins + Bruce Banner).
--
-- Run inside a transaction. To execute:
--   psql ... -f cleanup_to_gbc002.sql
-- or via Supabase CLI:
--   supabase db execute -f supabase/scripts/cleanup_to_gbc002.sql
--
-- DESTRUCTIVE. Make sure prod backup is available before running.
-- ============================================================================

BEGIN;

-- ── What we keep ────────────────────────────────────────────────────────────
-- These are loaded into temp tables so the WHERE clauses below stay readable.

CREATE TEMP TABLE kept_service_ids (id uuid PRIMARY KEY);
INSERT INTO kept_service_ids VALUES ('1c131367-b89f-44db-8787-6958a306b73d');  -- GBC-0002

CREATE TEMP TABLE kept_client_profile_ids (id uuid PRIMARY KEY);
INSERT INTO kept_client_profile_ids VALUES
  ('7066e718-2da8-4cbb-a72f-abc7ca0e4e59'),  -- Vanessa Rangasamy (UBO+shareholder)
  ('d6070bed-7ad0-4fd5-bcbf-7e1f58952644'),  -- New Corporation (director)
  ('71f7b3ce-fd29-485a-a91d-90fb95c37112'),  -- New Director
  ('27412eba-f603-46cf-8c65-df139a41f335'),  -- test (director)
  ('4969fdd0-467e-401b-a23b-7341b17d9132');  -- Bruce Banner (director+shareholder+UBO)

CREATE TEMP TABLE kept_user_ids (id uuid PRIMARY KEY);
INSERT INTO kept_user_ids VALUES
  ('4e71552a-7e24-48a2-a522-d1db02ee36ce'),  -- Jane Doe (admin + GBC-0002 link)
  ('a8d0ed01-250b-443a-8ec8-698c494e255f'),  -- Sarah Mitchell (admin)
  ('f3177bf6-67bb-4a2e-954a-0600f45ea91b'),  -- Tony Stark (admin)
  ('f58e089a-c4f9-4ece-88a9-edec54ceca8d');  -- Bruce Banner (GBC-0002 director)


-- ── Pre-cleanup row counts (for the run log) ────────────────────────────────

SELECT '=== BEFORE counts ===' AS phase;
SELECT 'services'                     AS tbl, COUNT(*) FROM services
UNION ALL SELECT 'applications',                COUNT(*) FROM applications
UNION ALL SELECT 'client_profiles',             COUNT(*) FROM client_profiles
UNION ALL SELECT 'client_profile_kyc',          COUNT(*) FROM client_profile_kyc
UNION ALL SELECT 'client_profile_kyc_history',  COUNT(*) FROM client_profile_kyc_history
UNION ALL SELECT 'profile_service_roles',       COUNT(*) FROM profile_service_roles
UNION ALL SELECT 'documents',                   COUNT(*) FROM documents
UNION ALL SELECT 'documents_history',           COUNT(*) FROM documents_history
UNION ALL SELECT 'document_uploads',            COUNT(*) FROM document_uploads
UNION ALL SELECT 'application_section_reviews', COUNT(*) FROM application_section_reviews
UNION ALL SELECT 'audit_log',                   COUNT(*) FROM audit_log
UNION ALL SELECT 'application_persons',         COUNT(*) FROM application_persons
UNION ALL SELECT 'kyc_records',                 COUNT(*) FROM kyc_records
UNION ALL SELECT 'clients',                     COUNT(*) FROM clients
UNION ALL SELECT 'client_users',                COUNT(*) FROM client_users
UNION ALL SELECT 'profile_roles',               COUNT(*) FROM profile_roles
UNION ALL SELECT 'users',                       COUNT(*) FROM users
UNION ALL SELECT 'profiles',                    COUNT(*) FROM profiles
UNION ALL SELECT 'admin_users',                 COUNT(*) FROM admin_users
ORDER BY tbl;


-- ── Delete order: leaves first, then trunks ────────────────────────────────

-- 0. Logs / history / audit tables — must come first because they have FKs
--    to applications/services/profiles/etc. that we're about to delete.
--    None of these are required for testing; safer to wipe entirely.
DELETE FROM audit_log;
DELETE FROM email_log;
DELETE FROM verification_codes;
DELETE FROM documents_history;
DELETE FROM client_profile_kyc_history;

-- 1. Section reviews on services we're not keeping
DELETE FROM application_section_reviews
 WHERE application_id NOT IN (SELECT id FROM kept_service_ids);

-- 2. Service-scoped admin tables (B-072)
DELETE FROM service_actions
 WHERE service_id NOT IN (SELECT id FROM kept_service_ids);

DELETE FROM service_substance
 WHERE service_id NOT IN (SELECT id FROM kept_service_ids);

DELETE FROM service_section_overrides
 WHERE service_id NOT IN (SELECT id FROM kept_service_ids);

-- 3. Document update requests
DELETE FROM document_update_requests
 WHERE service_id NOT IN (SELECT id FROM kept_service_ids);

-- 4. Documents — keep only those tied to GBC-0002. (documents_history
--    already wiped at step 0.)
DELETE FROM documents
 WHERE service_id NOT IN (SELECT id FROM kept_service_ids)
    OR service_id IS NULL;

-- 5. Junction tables on client_profiles
DELETE FROM profile_service_roles
 WHERE client_profile_id NOT IN (SELECT id FROM kept_client_profile_ids);

DELETE FROM profile_requirement_overrides
 WHERE client_profile_id NOT IN (SELECT id FROM kept_client_profile_ids);

-- 6. KYC for non-kept profiles. (kyc_history already wiped at step 0.)
DELETE FROM client_profile_kyc
 WHERE client_profile_id NOT IN (SELECT id FROM kept_client_profile_ids);

-- 7. Services (keep only GBC-0002)
DELETE FROM services
 WHERE id NOT IN (SELECT id FROM kept_service_ids);

-- 8. Legacy applications + their persons (wipe entirely)
DELETE FROM application_persons;
DELETE FROM applications;

-- 9. Client profiles (keep only the 5)
DELETE FROM client_profiles
 WHERE id NOT IN (SELECT id FROM kept_client_profile_ids);

-- 10. Legacy company tables (wipe entirely)
DELETE FROM client_users;
DELETE FROM clients;
DELETE FROM kyc_records;
DELETE FROM profile_roles;
DELETE FROM document_uploads;

-- 11. Account managers — wipe entirely (1 row, ties to a legacy client_id
--     that we're deleting in step 10)
DELETE FROM client_account_managers;

-- 12. (audit_log, email_log, verification_codes, history tables already
--      wiped at step 0 — required for FK ordering.)

-- 14. profiles — keep only the 4 (downstream of users)
DELETE FROM profiles
 WHERE id NOT IN (SELECT id FROM kept_user_ids);

-- 15. users — keep only the 4 (Auth.js side; this is what frees emails)
DELETE FROM users
 WHERE id NOT IN (SELECT id FROM kept_user_ids);


-- ── Post-cleanup row counts ────────────────────────────────────────────────

SELECT '=== AFTER counts ===' AS phase;
SELECT 'services'                     AS tbl, COUNT(*) FROM services
UNION ALL SELECT 'applications',                COUNT(*) FROM applications
UNION ALL SELECT 'client_profiles',             COUNT(*) FROM client_profiles
UNION ALL SELECT 'client_profile_kyc',          COUNT(*) FROM client_profile_kyc
UNION ALL SELECT 'client_profile_kyc_history',  COUNT(*) FROM client_profile_kyc_history
UNION ALL SELECT 'profile_service_roles',       COUNT(*) FROM profile_service_roles
UNION ALL SELECT 'documents',                   COUNT(*) FROM documents
UNION ALL SELECT 'documents_history',           COUNT(*) FROM documents_history
UNION ALL SELECT 'document_uploads',            COUNT(*) FROM document_uploads
UNION ALL SELECT 'application_section_reviews', COUNT(*) FROM application_section_reviews
UNION ALL SELECT 'audit_log',                   COUNT(*) FROM audit_log
UNION ALL SELECT 'application_persons',         COUNT(*) FROM application_persons
UNION ALL SELECT 'kyc_records',                 COUNT(*) FROM kyc_records
UNION ALL SELECT 'clients',                     COUNT(*) FROM clients
UNION ALL SELECT 'client_users',                COUNT(*) FROM client_users
UNION ALL SELECT 'profile_roles',               COUNT(*) FROM profile_roles
UNION ALL SELECT 'users',                       COUNT(*) FROM users
UNION ALL SELECT 'profiles',                    COUNT(*) FROM profiles
UNION ALL SELECT 'admin_users',                 COUNT(*) FROM admin_users
ORDER BY tbl;

-- IMPORTANT: change ROLLBACK to COMMIT to actually apply the cleanup.
-- ROLLBACK gives you a dry run that prints the AFTER counts but doesn't
-- persist anything.

ROLLBACK;
-- COMMIT;
