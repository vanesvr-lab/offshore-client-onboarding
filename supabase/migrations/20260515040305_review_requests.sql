-- B-118 — Peer / Manager review request feature.
--
-- An admin can ask one or more other admins to review specific sections
-- of a service. Single shared status: any one invited reviewer marking
-- the request closes it for everyone (the requester can also force-close
-- it). RLS: deny-by-default, all access through createAdminClient()
-- server-side; routes gate on `session.user.role === "admin"` (NextAuth,
-- not Supabase Auth).
--
-- Foreign keys to admins land on `profiles(id)` because the project
-- model wires `admin_users.user_id → profiles.id`, and using profiles
-- here keeps the (tenant, deletes-cascade) story consistent with every
-- other admin-actor reference in the schema (e.g. reviewed_by).

CREATE TABLE IF NOT EXISTS public.review_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                  REFERENCES public.tenants(id),
  service_id    uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  requester_id  uuid NOT NULL REFERENCES public.profiles(id),
  note          text NOT NULL,
  status        text NOT NULL CHECK (status IN ('open','closed')) DEFAULT 'open',
  closed_at     timestamptz,
  closed_by     uuid REFERENCES public.profiles(id),
  closed_reason text CHECK (closed_reason IN ('reviewer_marked','requester_force_closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_requests_service
  ON public.review_requests (service_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_open
  ON public.review_requests (service_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_review_requests_tenant
  ON public.review_requests (tenant_id);

CREATE TABLE IF NOT EXISTS public.review_request_reviewers (
  request_id uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  admin_id   uuid NOT NULL REFERENCES public.profiles(id),
  PRIMARY KEY (request_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_review_request_reviewers_admin
  ON public.review_request_reviewers (admin_id);

CREATE TABLE IF NOT EXISTS public.review_request_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  section_key  text NOT NULL,
  profile_id   uuid REFERENCES public.client_profiles(id) ON DELETE CASCADE
);

-- One row per (request, section_key, profile_id). NULLS NOT DISTINCT so
-- two top-level rows for the same request+section_key (profile_id=NULL)
-- are still rejected. Requires Postgres 15+ (Supabase is on 15).
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_request_sections_unique
  ON public.review_request_sections (request_id, section_key, profile_id)
  NULLS NOT DISTINCT;

ALTER TABLE public.review_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_request_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_request_sections  ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.review_requests IS
  'B-118 — admin-to-admin review requests. Single shared status (open|closed); any reviewer or the requester can close.';
COMMENT ON COLUMN public.review_request_sections.section_key IS
  'company_setup | financial | banking | documents | people_kyc_profile';
COMMENT ON COLUMN public.review_request_sections.profile_id IS
  'Required only when section_key=''people_kyc_profile''; NULL for top-level sections.';
