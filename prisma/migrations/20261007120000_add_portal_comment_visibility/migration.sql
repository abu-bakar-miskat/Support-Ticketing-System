-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "portalVisible" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing requester-authored portal comments in the new public
-- thread. Existing staff comments remain private because their old audience
-- cannot be determined safely.
UPDATE "Comment"
SET "portalVisible" = true
WHERE "body" LIKE '[Portal — %';
