-- B-108 Batch 3 — service alerts (auto + manual)
--
-- `service_alerts` stores only **manual** admin-authored alerts; auto
-- alerts are computed at render time so they always reflect current
-- truth (no stale rows to garbage-collect).
--
-- `dismissed_auto_alerts` records dismissals of *auto* alerts keyed by
-- `(service_id, auto_alert_key)`. The detector skips any auto alert
-- whose key matches an existing dismissal row, so re-show happens
-- automatically when the underlying condition resolves and recurs with
-- a new key (e.g. a different doc expires next time round).

CREATE TABLE IF NOT EXISTS public.service_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                 REFERENCES public.tenants(id),
  service_id   uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  severity     text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title        text NOT NULL,
  note         text,
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'resolved')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.users(id),
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_service ON public.service_alerts(service_id);
CREATE INDEX IF NOT EXISTS idx_alerts_open    ON public.service_alerts(service_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.dismissed_auto_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                    REFERENCES public.tenants(id),
  service_id      uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  auto_alert_key  text NOT NULL,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  dismissed_by    uuid REFERENCES public.users(id),
  UNIQUE (service_id, auto_alert_key)
);

ALTER TABLE public.service_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dismissed_auto_alerts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
