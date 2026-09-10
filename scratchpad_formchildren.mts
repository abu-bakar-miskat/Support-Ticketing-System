import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
const w = { formConfigId: "8bc258ce-1ba5-4d9d-af44-2edd67fa55e6" };
const c = {
  intake_noCascade: await p.intake.count({ where: w }),
  pendingIntake_noCascade: await p.pendingIntake.count({ where: w }),
  slaPolicy_cascade: await p.slaPolicy.count({ where: w }),
  assignmentRule_cascade: await p.assignmentRule.count({ where: w }),
  intakeFormField_cascade: await p.intakeFormField.count({ where: w }),
  intakeIssue_cascade: await p.intakeIssue.count({ where: w }),
};
console.log("INTAKE FORM CHILDREN:", JSON.stringify(c, null, 2));
await p.$disconnect(); await pool.end();
