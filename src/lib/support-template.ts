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
    select: { emailConfig: true },
  });
  if (!dept) return;

  if (dept.emailConfig == null) {
    await prisma.department.update({
      where: { id: departmentId },
      data: { emailConfig: emailConfigDefaults() as unknown as Prisma.InputJsonValue },
    });
  }

  await resolveSupportProjectForDepartment(departmentId);
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
