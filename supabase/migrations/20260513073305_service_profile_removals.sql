-- B-101 Batch 3 — Soft-delete a profile from a service.
--
-- Admin removes a profile from the People & KYC section of a service.
-- The profile vanishes from the People & KYC accordion, the KYC Documents
-- tab, and the per-profile review summary panel — but the underlying
-- `profile_service_roles` rows stay intact so re-adding the profile to the
-- service restores the role assignments cleanly.
--
-- Soft delete (not a hard DELETE on `profile_service_roles`) so:
--   1. Audit trail is preserved
--   2. Role assignments can be restored without a re-add UX (future
--      "Removed people (N)" panel — tech-debt entry)
--
-- Mirrors `waived_document_requirements` from B-100: tenant-scoped,
-- service-role-only access, default-deny RLS, no anon-key policies.

CREATE TABLE IF NOT EXISTS public.service_profile_removals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                        REFERENCES public.tenants(id),
  service_id          uuid NOT NULL
                        REFERENCES public.services(id) ON DELETE CASCADE,
  client_profile_id   uuid NOT NULL
                        REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  removed_at          timestamptz NOT NULL DEFAULT now(),
  removed_by          uuid NOT NULL REFERENCES public.users(id),
  UNIQUE (service_id, client_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_spr_service
  ON public.service_profile_removals(service_id);
CREATE INDEX IF NOT EXISTS idx_spr_profile
  ON public.service_profile_removals(client_profile_id);

ALTER TABLE public.service_profile_removals ENABLE ROW LEVEL SECURITY;
-- App talks to this table through the service-role admin client only,
-- mirroring `waived_document_requirements`. No anon-key policies —
-- default-deny RLS keeps PostgREST honest.

NOTIFY pgrst, 'reload schema';
