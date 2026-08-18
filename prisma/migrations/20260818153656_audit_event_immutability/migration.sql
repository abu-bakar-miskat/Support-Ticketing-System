-- DAT-05 (slice 20): AuditEvent rows are append-only. This is enforced at the
-- database layer, not just by omission of an update/delete route — a
-- guarantee that holds even if a future application change accidentally adds
-- one. `TRUNCATE` is deliberately not blocked here (it isn't reachable from
-- any Prisma call), only UPDATE/DELETE via ordinary DML.
CREATE OR REPLACE FUNCTION public.reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are immutable and cannot be updated or deleted (DAT-05)';
END;
$$;

CREATE TRIGGER audit_event_no_update
  BEFORE UPDATE ON public."AuditEvent"
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_audit_event_mutation();

CREATE TRIGGER audit_event_no_delete
  BEFORE DELETE ON public."AuditEvent"
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_audit_event_mutation();
