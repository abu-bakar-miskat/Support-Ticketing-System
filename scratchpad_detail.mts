import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const id = "cmtr9w43f00113ujlou34n0nv";
const tickets = await p.ticket.findMany({ where: { subDepartmentId: id },
  select: { ticketNumber: true, status: true, createdAt: true, deletedAt: true } });
const forms = await p.intakeFormConfig.findMany({ where: { intakeSubDepartmentId: id },
  select: { name: true, isActive: true, scope: true } });
console.log("TICKETS:", JSON.stringify(tickets, null, 2));
console.log("INTAKE FORMS:", JSON.stringify(forms, null, 2));
await p.$disconnect(); await pool.end();
