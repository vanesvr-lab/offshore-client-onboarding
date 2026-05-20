-- B-144 — Add human-recognizable name to services.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS name text;

-- Backfill existing rows: "{Template name} ({service_number})"
-- so every existing service has a non-empty name immediately.
UPDATE public.services s
SET name = COALESCE(
  st.name || ' (' || s.service_number || ')',
  s.service_number,  -- fallback when template name is somehow null
  'Service'           -- last-resort fallback
)
FROM public.service_templates st
WHERE s.service_template_id = st.id
  AND (s.name IS NULL OR s.name = '');

-- For services whose template lookup failed (unlikely but possible),
-- backfill with just the service_number.
UPDATE public.services
SET name = COALESCE(service_number, 'Service')
WHERE name IS NULL OR name = '';

-- Now add NOT NULL constraint
ALTER TABLE public.services
  ALTER COLUMN name SET NOT NULL;

-- Add CHECK to prevent empty-string names from sneaking in
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_name_non_empty;
ALTER TABLE public.services
  ADD CONSTRAINT services_name_non_empty CHECK (length(trim(name)) > 0);

-- Audit trigger: log name changes (mirrors B-130's assignment trigger).
CREATE OR REPLACE FUNCTION public.log_service_name_change() RETURNS trigger AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO public.audit_log (
      actor_id, actor_role, action, entity_type, entity_id,
      previous_value, new_value
    ) VALUES (
      auth.uid(),
      'admin',
      'service_renamed',
      'service',
      NEW.id,
      jsonb_build_object('name', OLD.name),
      jsonb_build_object('name', NEW.name)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS service_name_audit ON public.services;
CREATE TRIGGER service_name_audit
  AFTER UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.log_service_name_change();
