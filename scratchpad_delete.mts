import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });

const subId = "cmtr9w43f00113ujlou34n0nv";
const ticketIds = ['cmtsqi3wv0049tmjxdt9firnn','cmtra2cv6001n3ujlqpul0byj'];
const formId = "8bc258ce-1ba5-4d9d-af44-2edd67fa55e6";
const tw = { ticketId: { in: ticketIds } };

await p.$transaction([
  // 1. Clear every ticket child (cascade or not) — DB cascade is unreliable on this drift-prone DB
  p.activityLog.deleteMany({ where: tw }),
  p.attachment.deleteMany({ where: tw }),
  p.comment.deleteMany({ where: tw }),
  p.gitHubCommit.deleteMany({ where: tw }),
  p.intake.deleteMany({ where: tw }),
  p.notification.deleteMany({ where: tw }),
  p.pendingIntake.deleteMany({ where: tw }),
  p.ruleExecutionLog.deleteMany({ where: tw }),
  p.slaBreach.deleteMany({ where: tw }),
  p.slaTimer.deleteMany({ where: tw }),
  p.ticketAccessGrant.deleteMany({ where: tw }),
  p.ticketAssignee.deleteMany({ where: tw }),
  p.ticketEstimate.deleteMany({ where: tw }),
  p.ticketMessage.deleteMany({ where: tw }),
  p.ticketPullRequest.deleteMany({ where: tw }),
  p.ticketQaAssignee.deleteMany({ where: tw }),
  p.timeEntry.deleteMany({ where: tw }),
  // 2. Delete the 2 tickets
  p.ticket.deleteMany({ where: { id: { in: ticketIds } } }),
  // 3. Delete the "Support" intake form (no children)
  p.intakeFormConfig.delete({ where: { id: formId } }),
  // 4. Belt-and-suspenders: remove the 1 invite (schema cascades, but drift-safe)
  p.departmentInvite.deleteMany({ where: { subDepartmentId: subId } }),
  // 5. App endpoint's exact sub-department cleanup
  p.profile.updateMany({ where: { subDepartmentId: subId }, data: { subDepartmentId: null } }),
  p.routingRule.updateMany({ where: { subDepartmentId: subId }, data: { subDepartmentId: null } }),
  p.intakeIssue.updateMany({ where: { intakeSubDepartmentId: subId }, data: { intakeSubDepartmentId: null } }),
  p.project.updateMany({ where: { subDepartmentId: subId }, data: { subDepartmentId: null } }),
  p.subDepartmentStatus.deleteMany({ where: { subDepartmentId: subId } }),
  p.subDepartmentTicketCounter.deleteMany({ where: { subDepartmentId: subId } }),
  p.subDepartmentGitHubStatusMap.deleteMany({ where: { subDepartmentId: subId } }),
  p.subDepartment.delete({ where: { id: subId } }),
], { timeout: 60000, maxWait: 15000 });

const still = await p.subDepartment.findUnique({ where: { id: subId }, select: { id: true } });
console.log(still ? "STILL EXISTS ??" : "DELETED: Sub Zero is gone.");
await p.$disconnect(); await pool.end();
