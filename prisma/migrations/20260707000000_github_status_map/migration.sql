-- CreateTable
CREATE TABLE "TeamGitHubStatusMap" (
    "teamId" TEXT NOT NULL,
    "onPrOpened" TEXT,
    "onPrReadyForReview" TEXT,
    "onPrMerged" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamGitHubStatusMap_pkey" PRIMARY KEY ("teamId")
);

-- AddForeignKey
ALTER TABLE "TeamGitHubStatusMap" ADD CONSTRAINT "TeamGitHubStatusMap_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

