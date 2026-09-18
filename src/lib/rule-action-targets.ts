import "server-only";
import { prisma } from "@/lib/db";
import { assertUsersEligibleForProjectDepartment } from "@/lib/project-department-people";
import { collectRuleActionTargetIds } from "@/lib/rule-validation";

/**
 * Ensure assign_agent / assign_group targets belong to the department —
 * never accept arbitrary free-text ids from outside scope.
 */
export async function assertRuleActionTargetsInDepartment(
  departmentId: string,
  actions: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { agentIds, subDepartmentIds } = collectRuleActionTargetIds(actions);

  if (agentIds.length > 0) {
    const unique = [...new Set(agentIds)];
    const check = await assertUsersEligibleForProjectDepartment(departmentId, unique);
    if (!check.ok) {
      return {
        ok: false,
        error: "assign_agent must target a member of this department",
      };
    }
  }

  if (subDepartmentIds.length > 0) {
    const unique = [...new Set(subDepartmentIds)];
    const found = await prisma.subDepartment.findMany({
      where: { departmentId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      return {
        ok: false,
        error: "assign_group must target a sub-department of this department",
      };
    }
  }

  return { ok: true };
}
