-- Index advisor: Profile.name for ORDER BY name ASC queries (planner cost 589 -> 55)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Profile_name_idx" ON "Profile" ("name");

-- Composite for ActivityLog project-activity: ticketId + createdAt DESC in one scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ActivityLog_ticketId_createdAt_idx" ON "ActivityLog" ("ticketId", "createdAt" DESC);
