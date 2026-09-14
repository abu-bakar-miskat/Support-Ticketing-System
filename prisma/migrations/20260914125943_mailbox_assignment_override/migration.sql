-- Per-mailbox ticket-assignment override (additive, nullable — inherits the
-- sub-department method when null, so existing connections are unaffected).
-- AlterTable
ALTER TABLE "MailboxConnection" ADD COLUMN     "assignmentMethod" "AssignmentMethod",
ADD COLUMN     "manualAssigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
