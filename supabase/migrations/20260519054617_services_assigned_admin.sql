-- B-130 — Add assigned_admin_id to services so admins can claim
-- ownership of a service. Nullable (services start unassigned).

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS services_assigned_admin_idx
  ON public.services(assigned_admin_id);

-- Audit trigger: log every assignment change so we have a paper trail
-- of who handed off what to whom.
CREATE OR REPLACE FUNCTION public.log_service_assignment_change() RETURNS trigger AS $$
BEGIN
  IF OLD.assigned_admin_id IS DISTINCT FROM NEW.assigned_admin_id THEN
    INSERT INTO public.audit_log (
      actor_id, actor_role, action, entity_type, entity_id,
      previous_value, new_value
    ) VALUES (
      auth.uid(),
      'admin',
      'service_assignment_changed',
      'service',
      NEW.id,
      jsonb_build_object('assigned_admin_id', OLD.assigned_admin_id),
      jsonb_build_object('assigned_admin_id', NEW.assigned_admin_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS service_assignment_audit ON public.services;
CREATE TRIGGER service_assignment_audit
  AFTER UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.log_service_assignment_change();
