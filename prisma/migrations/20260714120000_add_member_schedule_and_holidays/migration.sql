-- CreateTable
CREATE TABLE IF NOT EXISTS "MemberSchedule" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "workStartTime" TEXT NOT NULL DEFAULT '09:00',
    "workEndTime" TEXT NOT NULL DEFAULT '17:00',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MemberHoliday" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MemberSchedule_userId_key" ON "MemberSchedule"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MemberSchedule_userId_idx" ON "MemberSchedule"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MemberHoliday_userId_idx" ON "MemberHoliday"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MemberHoliday_userId_date_key" ON "MemberHoliday"("userId", "date");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "MemberSchedule"
    ADD CONSTRAINT "MemberSchedule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MemberHoliday"
    ADD CONSTRAINT "MemberHoliday_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
