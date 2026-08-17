-- Allow tickets without a project (e.g. "Miscellaneous" team-board tickets)
ALTER TABLE "Ticket" ALTER COLUMN "projectId" DROP NOT NULL;
