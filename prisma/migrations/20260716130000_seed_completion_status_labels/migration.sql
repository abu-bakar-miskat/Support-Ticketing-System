-- Preserve today's behavior for existing completion statuses: the
-- Resolution/No Resolution choice used to be hardcoded for intake tickets
-- reaching a completion status. Now that label choice is driven by
-- TeamStatus.allowedLabels, seed the same pair onto every completion status
-- that doesn't already have labels linked, so nothing changes by default.
UPDATE "TeamStatus"
SET "allowedLabels" = ARRAY['Resolution', 'No Resolution']
WHERE "isComplete" = true
  AND cardinality("allowedLabels") = 0;

-- Make sure those two labels exist in each department's registry so they show
-- up (with a color) in the label picker/settings UI, same as before.
INSERT INTO "Label" ("id", "name", "color", "departmentId")
SELECT gen_random_uuid()::text, v."name", v."color", d."id"
FROM "Department" d
CROSS JOIN (VALUES ('Resolution', '#16a34a'), ('No Resolution', '#dc2626')) AS v("name", "color")
ON CONFLICT ("name", "departmentId") DO NOTHING;
