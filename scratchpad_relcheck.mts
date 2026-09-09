import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const subId = "cmtr9w43f00113ujlou34n0nv";
const ticketIds = (await p.ticket.findMany({ where: { subDepartmentId: subId }, select: { id: true } })).map(t=>t.id);
const formIds = (await p.intakeFormConfig.findMany({ where: { intakeSubDepartmentId: subId }, select: { id: true } })).map(f=>f.id);
console.log("ticketIds", ticketIds, "formIds", formIds);

// Other SubDepartment relations that the endpoint does NOT clear — confirm empty (or cascade)
const other = {
  rules: await p.rule.count({ where: { subDepartmentId: subId } }),
  slaPolicies: await p.slaPolicy.count({ where: { subDepartmentId: subId } }),
  joinRequests: await p.joinRequest.count({ where: { subDepartmentId: subId } }),
  invites: await p.departmentInvite.count({ where: { subDepartmentId: subId } }),
  mailboxConnections: await p.mailboxConnection.count({ where: { subDepartmentId: subId } }),
  assignmentRules: await p.assignmentRule.count({ where: { subDepartmentId: subId } }),
  memberships: await p.subDepartmentMembership.count({ where: { subDepartmentId: subId } }),
  statuses: await p.subDepartmentStatus.count({ where: { subDepartmentId: subId } }),
  routingRules: await p.routingRule.count({ where: { subDepartmentId: subId } }),
  projects: await p.project.count({ where: { subDepartmentId: subId } }),
  intakeIssues: await p.intakeIssue.count({ where: { intakeSubDepartmentId: subId } }),
};
console.log("OTHER SUBDEPT RELATIONS:", JSON.stringify(other, null, 2));
await p.$disconnect(); await pool.end();
