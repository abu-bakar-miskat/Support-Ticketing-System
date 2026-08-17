-- CreateTable
CREATE TABLE "DepartmentHoliday" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentHoliday_departmentId_startDate_idx" ON "DepartmentHoliday"("departmentId", "startDate");

-- AddForeignKey
ALTER TABLE "DepartmentHoliday" ADD CONSTRAINT "DepartmentHoliday_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

