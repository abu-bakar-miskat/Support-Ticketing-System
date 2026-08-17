-- CreateTable
CREATE TABLE "DepartmentEvent" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentEvent_departmentId_startDate_idx" ON "DepartmentEvent"("departmentId", "startDate");

-- AddForeignKey
ALTER TABLE "DepartmentEvent" ADD CONSTRAINT "DepartmentEvent_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

