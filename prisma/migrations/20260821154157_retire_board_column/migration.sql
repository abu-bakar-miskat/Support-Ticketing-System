-- Retire the vestigial BoardColumn model and Ticket.boardColumnId.
-- DESTRUCTIVE — apply ONLY in a coordinated window once every running
-- instance is on code that no longer references these (see plan Phase 2).
-- Idempotent guards so a re-run is safe.

ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_boardColumnId_fkey";
DROP INDEX IF EXISTS "Ticket_boardColumnId_idx";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "boardColumnId";
DROP TABLE IF EXISTS "BoardColumn";
