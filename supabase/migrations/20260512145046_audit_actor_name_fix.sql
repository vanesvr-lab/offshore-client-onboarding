-- B-094 — Audit trail actor attribution
--
-- Two fixes in one migration:
--   1) Backfill existing audit_log rows where actor_name is null.
--      All current data is testing — set them to 'Jane Doe' (per
--      Vanessa's call) so the UI stops showing 'System'.
--   2) Harden get_actor_info() so when auth.uid() is null (e.g., a
--      service-role connection that bypasses RLS), the function falls
--      back to a session-local config variable that admin routes can
--      set before mutations. This prevents future trigger-driven audit
--      writes from defaulting to 'system'.

-- 1. Backfill
UPDATE audit_log
SET actor_name = 'Jane Doe'
WHERE actor_name IS NULL;

-- 2. Harden get_actor_info
CREATE OR REPLACE FUNCTION public.get_actor_info(
  out v_actor_id uuid,
  out v_actor_role text,
  out v_actor_name text
) AS $$
DECLARE
  cfg_actor_id text;
  cfg_actor_role text;
  cfg_actor_name text;
BEGIN
  v_actor_id := auth.uid();

  -- Service-role / non-RLS connections: auth.uid() is null.
  -- Try session config fallback (set by admin routes when needed).
  IF v_actor_id IS NULL THEN
    cfg_actor_id := current_setting('app.actor_id', true);

    IF cfg_actor_id IS NOT NULL AND cfg_actor_id <> '' THEN
      v_actor_id := cfg_actor_id::uuid;
      cfg_actor_role := current_setting('app.actor_role', true);
      cfg_actor_name := current_setting('app.actor_name', true);
      v_actor_role := COALESCE(NULLIF(cfg_actor_role, ''), 'admin');
      v_actor_name := COALESCE(NULLIF(cfg_actor_name, ''), 'Unknown user');
      RETURN;
    END IF;

    -- Last-resort fallback (no session config either) — keep the
    -- existing 'system' attribution so we can still spot it in QA.
    v_actor_role := 'system';
    v_actor_name := 'system';
    RETURN;
  END IF;

  -- Standard auth.uid() path: look up profile name + role.
  SELECT COALESCE(full_name, email)
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = v_actor_id) THEN
    v_actor_role := 'admin';
  ELSIF EXISTS(SELECT 1 FROM public.client_users WHERE user_id = v_actor_id) THEN
    v_actor_role := 'client';
  ELSE
    v_actor_role := 'system';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
