-- Separate portal credentials from general/MCP credentials so a portal key
-- cannot be replayed against broader API surfaces.
ALTER TABLE "ApiKey"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'general';
