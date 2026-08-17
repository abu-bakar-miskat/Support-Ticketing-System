-- CreateEnum
CREATE TYPE "GitHubPRState" AS ENUM ('draft', 'open', 'merged', 'closed');

-- CreateTable
CREATE TABLE "GitHubPullRequest" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "authorLogin" TEXT NOT NULL,
    "state" "GitHubPRState" NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubPullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPullRequest" (
    "ticketId" TEXT NOT NULL,
    "prId" TEXT NOT NULL,

    CONSTRAINT "TicketPullRequest_pkey" PRIMARY KEY ("ticketId","prId")
);

-- CreateTable
CREATE TABLE "GitHubCommit" (
    "id" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorLogin" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubCommit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubPullRequest_number_key" ON "GitHubPullRequest"("number");

-- CreateIndex
CREATE INDEX "TicketPullRequest_prId_idx" ON "TicketPullRequest"("prId");

-- CreateIndex
CREATE INDEX "GitHubCommit_ticketId_idx" ON "GitHubCommit"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubCommit_sha_ticketId_key" ON "GitHubCommit"("sha", "ticketId");

-- AddForeignKey
ALTER TABLE "TicketPullRequest" ADD CONSTRAINT "TicketPullRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPullRequest" ADD CONSTRAINT "TicketPullRequest_prId_fkey" FOREIGN KEY ("prId") REFERENCES "GitHubPullRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubCommit" ADD CONSTRAINT "GitHubCommit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

