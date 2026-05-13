-- B-098 — Add FK so Supabase JS join `users(full_name, email)` resolves.
-- Without this, the join errors PGRST200 ("no relationship found in
-- schema cache") and the Assigned Officer dropdown on
-- /admin/services/[id] renders empty (B-096 removed the broken
-- tenant_id filter but the join still failed because no FK was declared).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_user_id_fkey'
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;
