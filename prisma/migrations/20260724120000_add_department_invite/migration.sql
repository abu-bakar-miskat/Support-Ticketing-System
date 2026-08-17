-- CreateTable
CREATE TABLE "DepartmentInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "message" TEXT,
    "invitedBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DepartmentInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentInvite_token_key" ON "DepartmentInvite"("token");

-- CreateIndex
CREATE INDEX "DepartmentInvite_departmentId_idx" ON "DepartmentInvite"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentInvite_email_idx" ON "DepartmentInvite"("email");

-- CreateIndex
CREATE INDEX "DepartmentInvite_teamId_idx" ON "DepartmentInvite"("teamId");

-- CreateIndex
CREATE INDEX "DepartmentInvite_expiresAt_idx" ON "DepartmentInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "DepartmentInvite" ADD CONSTRAINT "DepartmentInvite_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentInvite" ADD CONSTRAINT "DepartmentInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentInvite" ADD CONSTRAINT "DepartmentInvite_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
