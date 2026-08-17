-- AlterTable
ALTER TABLE "GitHubPullRequest" ADD COLUMN "baseBranch" TEXT;
ALTER TABLE "GitHubPullRequest" ADD COLUMN "ghCreatedAt" TIMESTAMP(3);
