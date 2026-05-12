-- B-095 — Backfill `*_created` audit rows so the right-rail Status
-- card (B-093) and audit trail no longer fall back to "by system" on
-- entities that pre-date audit logging. Testing data — attribute all
-- to Jane Doe (Vanessa's call).
--
-- Jane Doe currently lives in `public.users` (new auth table) and
-- historically also in `public.profiles` (legacy). Try `users` first,
-- fall back to `profiles` so the script is robust across environments.
--
-- Note: this replaces an accidentally-empty migration applied at
-- 20260512152321; the real SQL is consolidated here.

DO $$
DECLARE
  jane_id uuid;
BEGIN
  SELECT id INTO jane_id
  FROM public.users
  WHERE email = 'vanes.vr@gmail.com'
  LIMIT 1;

  IF jane_id IS NULL THEN
    SELECT id INTO jane_id
    FROM public.profiles
    WHERE email = 'vanes.vr@gmail.com'
    LIMIT 1;
  END IF;

  IF jane_id IS NULL THEN
    RAISE NOTICE 'B-095 backfill: Jane Doe profile not found; skipping';
    RETURN;
  END IF;

  -- Services: insert a service_created audit per service that doesn't
  -- already have one.
  INSERT INTO public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value, created_at
  )
  SELECT
    NULL, jane_id, 'admin', 'Jane Doe',
    'service_created', 'service', s.id,
    jsonb_build_object('service_number', s.service_number, 'status', s.status),
    s.created_at
  FROM public.services s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.entity_type = 'service'
      AND a.entity_id = s.id
      AND a.action = 'service_created'
  );

  -- Clients
  INSERT INTO public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value, created_at
  )
  SELECT
    NULL, jane_id, 'admin', 'Jane Doe',
    'client_created', 'client', c.id,
    jsonb_build_object('company_name', c.company_name),
    c.created_at
  FROM public.clients c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.entity_type = 'client'
      AND a.entity_id = c.id
      AND a.action = 'client_created'
  );

  -- Client profiles
  INSERT INTO public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value, created_at
  )
  SELECT
    NULL, jane_id, 'admin', 'Jane Doe',
    'profile_created', 'client_profile', cp.id,
    jsonb_build_object('full_name', cp.full_name, 'record_type', cp.record_type),
    cp.created_at
  FROM public.client_profiles cp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.entity_type = 'client_profile'
      AND a.entity_id = cp.id
      AND a.action = 'profile_created'
  );

END $$;
