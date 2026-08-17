-- Key GitHub PRs by (repository, number) so multi-repo webhooks cannot collide
-- on the same PR number (e.g. educateu-platform#52 vs PEN-WEBSITES-CMS#52).

-- 1. Add nullable column
ALTER TABLE "GitHubPullRequest" ADD COLUMN IF NOT EXISTS "repository" TEXT;

-- 2. Backfill owner/name from the PR html URL
UPDATE "GitHubPullRequest"
SET "repository" = substring(url from 'https://github\.com/([^/]+/[^/]+)')
WHERE "repository" IS NULL OR "repository" = '';

-- 3. Any rows still missing a parseable URL keep a stable sentinel so NOT NULL succeeds
UPDATE "GitHubPullRequest"
SET "repository" = 'unknown/unknown'
WHERE "repository" IS NULL OR "repository" = '';

-- 4. Enforce NOT NULL
ALTER TABLE "GitHubPullRequest" ALTER COLUMN "repository" SET NOT NULL;

-- 5. Replace number-only uniqueness with (repository, number)
DROP INDEX IF EXISTS "GitHubPullRequest_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "GitHubPullRequest_repository_number_key"
  ON "GitHubPullRequest"("repository", "number");
