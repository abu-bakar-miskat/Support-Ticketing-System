-- CreateTable (TeamStatus was never created in a prior migration)
CREATE TABLE IF NOT EXISTS "TeamStatus" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#94a3b8',
    "order" INTEGER NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeamStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TeamStatus_teamId_label_key" ON "TeamStatus"("teamId", "label");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TeamStatus_teamId_order_idx" ON "TeamStatus"("teamId", "order");

-- AddForeignKey (only if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TeamStatus_teamId_fkey'
  ) THEN
    ALTER TABLE "TeamStatus"
      ADD CONSTRAINT "TeamStatus_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "Team"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
