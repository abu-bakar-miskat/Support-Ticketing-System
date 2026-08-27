-- CreateTable: platform-wide global config (see lib/platform-settings.ts).
-- Additive only — all pre-existing drift emitted by `prisma migrate diff`
-- (BoardColumn drops, Department.branding, Ticket.boardColumnId, etc.) was
-- intentionally stripped per AGENTS.md; this migration adds one new table.
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);
