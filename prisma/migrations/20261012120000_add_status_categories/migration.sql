-- Add lifecycle categories without changing ticket statuses or sending notifications.
-- Generated with migrate diff; unrelated IntakeFormConfig FK drift was excluded.
BEGIN;
CREATE TYPE "StatusCategory" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE');
ALTER TABLE "TeamStatus" ADD COLUMN "category" "StatusCategory" NOT NULL DEFAULT 'TODO';

-- Preserve all existing completion flags. Classify the other existing columns;
-- custom names can be reassigned in Workflows after deployment.
UPDATE "TeamStatus" SET "category" = CASE
  WHEN "isComplete" THEN 'COMPLETE'
  WHEN lower(trim("label")) IN ('block', 'blocked', 'paused', 'on hold', 'hold', 'rejected', 'escalated', 'escaleted', 'waiting', 'cancelled', 'canceled', 'ended (no resolution)') THEN 'BLOCKED'
  WHEN lower(trim(replace("label", '_', ' '))) IN ('open', 'to do', 'to-do', 'todo', 'not started', 'backlog', 'new', 'start', 'pending', 'queued', 'queue', 'unstarted') THEN 'TODO'
  WHEN "order" = 0 THEN 'TODO'
  ELSE 'IN_PROGRESS'
END::"StatusCategory";

-- Keep isComplete as a compatibility mirror for existing reports and older
-- deployed clients. Explicit category changes win; legacy isComplete edits
-- move into/out of COMPLETE. No Ticket rows are touched by this trigger.
CREATE FUNCTION sync_team_status_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."category" = 'TODO' AND NEW."isComplete" THEN
      NEW."category" := 'COMPLETE';
    END IF;
  ELSIF NEW."category" IS NOT DISTINCT FROM OLD."category"
        AND NEW."isComplete" IS DISTINCT FROM OLD."isComplete" THEN
    IF NEW."isComplete" THEN NEW."category" := 'COMPLETE';
    ELSIF OLD."category" = 'COMPLETE' THEN NEW."category" := 'TODO';
    END IF;
  END IF;
  NEW."isComplete" := NEW."category" = 'COMPLETE';
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TeamStatus_sync_category" BEFORE INSERT OR UPDATE ON "TeamStatus"
FOR EACH ROW EXECUTE FUNCTION sync_team_status_category();
COMMIT;
