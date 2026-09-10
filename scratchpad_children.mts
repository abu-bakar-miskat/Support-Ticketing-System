import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const ticketIds = ['cmtsqi3wv0049tmjxdt9firnn','cmtra2cv6001n3ujlqpul0byj'];
const w = { ticketId: { in: ticketIds } };
const c = {
  comment: await p.comment.count({ where: w }),
  attachment: await p.attachment.count({ where: w }),
  ticketMessage: await p.ticketMessage.count({ where: w }),
  activityLog: await p.activityLog.count({ where: w }),
  timeEntry: await p.timeEntry.count({ where: w }),
  notification: await p.notification.count({ where: w }),
  intake: await p.intake.count({ where: w }),
  ticketPullRequest: await p.ticketPullRequest.count({ where: w }),
  githubCommit: await p.gitHubCommit.count({ where: w }),
};
console.log("NON-CASCADE TICKET CHILDREN:", JSON.stringify(c, null, 2));
await p.$disconnect(); await pool.end();
