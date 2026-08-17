-- Catch-up migration: records all schema objects that were applied to production
-- via db push but never recorded as migrations.

-- ─── Project ──────────────────────────────────────────────────────────────────
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "departmentId"  TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "projectStatus" TEXT DEFAULT 'pipeline';
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "githubRepo"    TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "assets"        JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "Project_departmentId_idx" ON "Project"("departmentId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Project_departmentId_fkey') THEN
    ALTER TABLE "Project"
      ADD CONSTRAINT "Project_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END; $$;

-- ─── ProjectMember ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProjectMember" (
    "id"        TEXT         NOT NULL,
    "projectId" TEXT         NOT NULL,
    "userId"    UUID         NOT NULL,
    "addedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_userId_key"
  ON "ProjectMember"("projectId", "userId");
CREATE INDEX IF NOT EXISTS "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectMember_projectId_fkey') THEN
    ALTER TABLE "ProjectMember"
      ADD CONSTRAINT "ProjectMember_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectMember_userId_fkey') THEN
    ALTER TABLE "ProjectMember"
      ADD CONSTRAINT "ProjectMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END; $$;

-- ─── TicketAssignee ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TicketAssignee" (
    "ticketId" TEXT NOT NULL,
    "userId"   UUID NOT NULL,
    CONSTRAINT "TicketAssignee_pkey" PRIMARY KEY ("ticketId", "userId")
);

CREATE INDEX IF NOT EXISTS "TicketAssignee_ticketId_idx" ON "TicketAssignee"("ticketId");
CREATE INDEX IF NOT EXISTS "TicketAssignee_userId_idx"   ON "TicketAssignee"("userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TicketAssignee_ticketId_fkey') THEN
    ALTER TABLE "TicketAssignee"
      ADD CONSTRAINT "TicketAssignee_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END; $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TicketAssignee_userId_fkey') THEN
    ALTER TABLE "TicketAssignee"
      ADD CONSTRAINT "TicketAssignee_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END; $$;

-- ─── Ticket ───────────────────────────────────────────────────────────────────
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "estimatedTime" INTEGER;

-- ─── Comment ──────────────────────────────────────────────────────────────────
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

CREATE INDEX IF NOT EXISTS "Comment_parentId_idx" ON "Comment"("parentId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Comment_parentId_fkey') THEN
    ALTER TABLE "Comment"
      ADD CONSTRAINT "Comment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Comment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END; $$;

-- ─── PushSubscription ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id"        TEXT         NOT NULL,
    "userId"    UUID         NOT NULL,
    "endpoint"  TEXT         NOT NULL,
    "p256dh"    TEXT         NOT NULL,
    "auth"      TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key"
  ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey') THEN
    ALTER TABLE "PushSubscription"
      ADD CONSTRAINT "PushSubscription_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END; $$;

-- ─── Notification ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Notification_commentId_fkey') THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_commentId_fkey"
      FOREIGN KEY ("commentId") REFERENCES "Comment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END; $$;

-- ─── DepartmentAccess ─────────────────────────────────────────────────────────
ALTER TABLE "DepartmentAccess" ADD COLUMN IF NOT EXISTS "reason" TEXT;

-- ─── JoinRequest ──────────────────────────────────────────────────────────────
ALTER TABLE "JoinRequest" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;
ALTER TABLE "JoinRequest" ALTER COLUMN "teamId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "JoinRequest_departmentId_status_idx"
  ON "JoinRequest"("departmentId", "status");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JoinRequest_departmentId_fkey') THEN
    ALTER TABLE "JoinRequest"
      ADD CONSTRAINT "JoinRequest_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END; $$;
