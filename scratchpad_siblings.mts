import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const deptId = "cmtr9vub7000s3ujlfefe74bs";
const sibs = await p.subDepartment.findMany({ where: { departmentId: deptId },
  select: { id: true, name: true, prefix: true } });
console.log("SUB-DEPTS in Dept XYZ:", JSON.stringify(sibs, null, 2));
await p.$disconnect(); await pool.end();
