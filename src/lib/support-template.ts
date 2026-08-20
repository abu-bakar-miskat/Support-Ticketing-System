import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { emailConfigDefaults } from "@/lib/email-config";
import { resolveSupportProjectForDepartment } from "@/lib/support-project";

/**
 * "Support template" auto-provisioning.
 *
 * Every new department gets a ready-to-use support setup so it can receive
 * support tickets without manual configuration. The bundle is made of
 * pre-existing, per-department config (there is no separate template model):
 *   - a Support project (where intake tickets land),
 *   - default email settings + template scaffolding on `Department.emailConfig`,
 *   - a default "Support" intake form.
 *
 * The intake form requires a sub-department to file tickets into, which a
 * brand-new department doesn't have yet — so it's created the moment the
 * department's first sub-department exists (see `ensureDefaultSupportForm`,
 * called from the sub-department create route). Everything else seeds at
 * department-creation time. All helpers are idempotent.
 *
 * These settings are edited through the existing department-scoped pages
 * (Settings → Support forms / Email settings), which live outside
 * /settings/templates by design.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Seeds department-scoped email settings + template defaults, and the Support
 * project. Idempotent: email defaults are only written when unset, and the
 * Support project upsert is a no-op if it already exists.
 */
export async function provisionDepartmentSupportTemplate(departmentId: string): Promise<void> {
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { tenantId: true, emailConfig: true },
  });
  if (!dept) return;

  if (dept.emailConfig == null) {
    await prisma.department.update({
      where: { id: departmentId },
      data: { emailConfig: emailConfigDefaults() as unknown as Prisma.InputJsonValue },
    });
  }

  await resolveSupportProjectForDepartment(departmentId);
  await seedDefaultSlaPolicies(departmentId, dept.tenantId);
  await seedSampleRules(departmentId, dept.tenantId);
}

// Priority-based defaults (SLA-01/02): stricter targets for higher priority, plus
// a catch-all "Standard" policy so every ticket gets a timer.
const DEFAULT_SLA_POLICIES = [
  {
    name: "Urgent",
    conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "Urgent" }] },
    firstResponseMins: 15,
    resolutionMins: 120,
  },
  {
    name: "High priority",
    conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "High" }] },
    firstResponseMins: 30,
    resolutionMins: 240,
  },
  {
    name: "Standard",
    conditions: { combinator: "AND", conditions: [] },
    firstResponseMins: 120,
    resolutionMins: 960,
  },
] as const;

/** Seed a department's default priority-based SLA policies. Idempotent — no-op if any policy exists. */
export async function seedDefaultSlaPolicies(departmentId: string, tenantId: string): Promise<void> {
  const existing = await prisma.slaPolicy.count({ where: { departmentId } });
  if (existing > 0) return;
  await prisma.slaPolicy.createMany({
    data: DEFAULT_SLA_POLICIES.map((p, order) => ({
      tenantId,
      departmentId,
      name: p.name,
      conditions: p.conditions as unknown as Prisma.InputJsonValue,
      firstResponseMins: p.firstResponseMins,
      resolutionMins: p.resolutionMins,
      order,
    })),
  });
}

// Illustrative starter rules, created DISABLED so they never change tickets until
// an admin reviews and enables them. They use only built-in fields (priority,
// type) so they work on manual + intake tickets without needing specific IDs.
const SAMPLE_RULES = [
  {
    name: "Escalate urgent tickets",
    conditions: { combinator: "AND", conditions: [{ fieldId: "priority", operator: "equals", value: "Urgent" }] },
    actions: [{ type: "change_column", params: { status: "ESCALATED" } }],
  },
  {
    name: "Tag bug reports",
    conditions: { combinator: "AND", conditions: [{ fieldId: "type", operator: "equals", value: "Bug" }] },
    actions: [{ type: "set_tag", params: { tag: "bug" } }],
  },
] as const;

/** Seed a department's sample automation rules (disabled). Idempotent — no-op if any rule exists. */
export async function seedSampleRules(departmentId: string, tenantId: string): Promise<void> {
  const existing = await prisma.rule.count({ where: { departmentId } });
  if (existing > 0) return;
  await prisma.rule.createMany({
    data: SAMPLE_RULES.map((r, order) => ({
      tenantId,
      departmentId,
      name: r.name,
      conditions: r.conditions as unknown as Prisma.InputJsonValue,
      actions: r.actions as unknown as Prisma.InputJsonValue,
      order,
      enabled: false,
      stopProcessing: false,
    })),
  });
}

/**
 * Creates the department's default "Support" intake form if it has none yet.
 * Requires a sub-department to file tickets into, so it's invoked when the
 * first sub-department is created. Idempotent — a no-op once any form exists.
 */
export async function ensureDefaultSupportForm(
  db: Db,
  departmentId: string,
  intakeSubDepartmentId: string,
): Promise<void> {
  const existing = await db.intakeFormConfig.count({ where: { departmentId } });
  if (existing > 0) return;

  await db.intakeFormConfig.create({
    data: {
      name: "Support",
      departmentId,
      intakeSubDepartmentId,
      isActive: true,
      allowCustomerReplies: true,
      autoAssign: true,
      // displayMode defaults to FORM; the four default static fields
      // (name, email, title, issue type) render automatically.
    },
  });
}
