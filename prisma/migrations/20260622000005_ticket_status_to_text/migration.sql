-- Convert Ticket.status from TicketStatus enum to TEXT.
-- The Prisma schema defines it as String @default("Not Started"), but the
-- column was left as the original enum type. The trigger must be dropped first
-- because its WHEN clause depends on the column type.

-- Drop all triggers that depend on the status column type
DROP TRIGGER IF EXISTS before_ticket_live ON public."Ticket";
DROP TRIGGER IF EXISTS after_ticket_status_change ON public."Ticket";

-- Convert column type
ALTER TABLE "Ticket"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Ticket"
  ALTER COLUMN "status" TYPE TEXT USING "status"::text;

ALTER TABLE "Ticket"
  ALTER COLUMN "status" SET DEFAULT 'Not Started';

-- Recreate both triggers using plain text comparisons
CREATE OR REPLACE TRIGGER after_ticket_status_change
  AFTER UPDATE ON public."Ticket"
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_ticket_status_change();

CREATE OR REPLACE TRIGGER before_ticket_live
  BEFORE UPDATE ON public."Ticket"
  FOR EACH ROW
  WHEN (NEW.status = 'Live' AND OLD.status IS DISTINCT FROM 'Live')
  EXECUTE FUNCTION public.capture_cycle_time();

-- Drop the now-unused TicketStatus enum.
DROP TYPE IF EXISTS "TicketStatus";
