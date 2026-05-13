-- B-101 Batch 4 — admin account settings (profile picture).
--
-- Adds `users.avatar_url` and a public `avatars` storage bucket. App-layer
-- writes go through the admin (service-role) Supabase client which bypasses
-- RLS, so the policies below are defensive guard rails for any future
-- direct-from-browser write that we haven't planned. Public read removes
-- the signed-URL roundtrip on every page render — avatars are non-PII.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies. Auth.js sessions don't set Supabase's auth.uid()
-- on the client, so direct-from-browser writes would currently fail these
-- checks. Server-side writes use the service-role client and bypass RLS.
-- Keep the policies in place so the bucket is hardened the day we wire a
-- session bridge.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can read avatars'
  ) THEN
    CREATE POLICY "Anyone can read avatars"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can upload their own avatar'
  ) THEN
    CREATE POLICY "Users can upload their own avatar"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can update their own avatar'
  ) THEN
    CREATE POLICY "Users can update their own avatar"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
