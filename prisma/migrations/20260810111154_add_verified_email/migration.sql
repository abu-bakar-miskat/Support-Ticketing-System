-- CreateTable
CREATE TABLE "VerifiedEmail" (
    "email" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifiedEmail_pkey" PRIMARY KEY ("email")
);
