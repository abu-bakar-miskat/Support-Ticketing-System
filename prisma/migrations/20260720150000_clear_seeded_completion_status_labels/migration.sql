-- Label choice on status change is opt-in via Settings → Workflows.
-- Remove the auto-seeded Resolution/No Resolution pair so the picker only
-- appears after a team explicitly links labels to a status.
UPDATE "TeamStatus"
SET "allowedLabels" = ARRAY[]::TEXT[]
WHERE "allowedLabels" = ARRAY['Resolution', 'No Resolution']::TEXT[];
