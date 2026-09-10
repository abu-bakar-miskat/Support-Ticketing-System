import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });
const subs = await p.subDepartment.findMany({
  where: { name: { contains: "sub zero", mode: "insensitive" } },
  select: { id: true, name: true, prefix: true, slug: true, departmentId: true, tenantId: true,
    department: { select: { name: true } }, tenant: { select: { slug: true, name: true } } },
});
if (!subs.length) console.log("No sub-department matching 'sub zero' found.");
for (const s of subs) {
  const [tickets, intake, members, profiles, projects] = await Promise.all([
    p.ticket.count({ where: { subDepartmentId: s.id } }),
    p.intakeFormConfig.count({ where: { intakeSubDepartmentId: s.id } }),
    p.subDepartmentMembership.count({ where: { subDepartmentId: s.id } }),
    p.profile.count({ where: { subDepartmentId: s.id } }),
    p.project.count({ where: { subDepartmentId: s.id } }),
  ]);
  console.log(JSON.stringify({ ...s, counts: { tickets, intake, members, profiles, projects } }, null, 2));
}
await p.$disconnect(); await pool.end();
