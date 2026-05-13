-- B-100 — Best-effort migration of free-text passport_country /
-- nationality values to ISO 3166-1 alpha-3 codes. Values that don't
-- match (typos, partial codes, etc.) are left as-is; the UI displays
-- them with an italic "(legacy)" tag until the user re-selects.
--
-- Pre-migration distribution (from `SELECT DISTINCT … COUNT(*) FROM
-- client_profile_kyc`):
--
--   passport_country (6 rows total):
--     4   (empty)
--     2   MUS                  ← already ISO3, no change needed
--
--   nationality (6 rows total):
--     4   (empty)
--     2   CITIZEN OF MAURITIUS ← needs backfill to "MUS"
--
-- Only the value mappings that actually appear in production are
-- encoded. A few extra common aliases are added defensively in case a
-- record lands between the snapshot and the migration push.

UPDATE public.client_profile_kyc
SET passport_country = 'MUS'
WHERE LOWER(passport_country) IN ('mauritius', 'mauritian', 'citizen of mauritius');

UPDATE public.client_profile_kyc
SET passport_country = 'GBR'
WHERE LOWER(passport_country) IN ('united kingdom', 'uk', 'great britain', 'england');

UPDATE public.client_profile_kyc
SET passport_country = 'USA'
WHERE LOWER(passport_country) IN ('united states', 'united states of america', 'us', 'usa');

UPDATE public.client_profile_kyc
SET nationality = 'MUS'
WHERE LOWER(nationality) IN ('mauritius', 'mauritian', 'citizen of mauritius');

UPDATE public.client_profile_kyc
SET nationality = 'GBR'
WHERE LOWER(nationality) IN ('united kingdom', 'uk', 'great britain', 'english', 'british');

UPDATE public.client_profile_kyc
SET nationality = 'USA'
WHERE LOWER(nationality) IN ('united states', 'united states of america', 'us', 'usa', 'american');
