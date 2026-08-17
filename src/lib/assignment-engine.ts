/**
 * Assignment engine — DB layer (slice 11, ASG-01/02/03). Wires the pure
 * pickers (lib/assignment.ts) and the shared ROTA helpers (lib/rota.ts) to
 * Prisma: resolving a department's configured method into an assignee (or a
 * recorded failure), and handling the "no eligible agent" path so no ticket
 * is ever silently left unrouted.
 *
 * Mirrors the pure/DB split established by lib/sla-engine.ts (slice 10).
 */
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notify";
import { sendAssignmentFailedAlertEmail } from "@/lib/email";
import { getEligibleMembers, getOpenTicketCounts } from "@/lib/rota";
import { pickRoundRobin, pickWorkload, pickRuleBased, type AssignmentRuleLike } from "@/lib/assignment";
import type { FormValues } from "@/lib/rules-engine";
import type { AssignmentMethod } from "@/generated/prisma/enums";

export type AutoAssignResult = {
  assigneeId: string | null;
  method: AssignmentMethod;
  failed: boolean;
  /** Set only for ROUND_ROBIN — the caller persists this onto Team.rotaPointer. */
  nextRotaPointer?: number;
};

async function isEligibleTeamMember(userId: string, teamId: string): Promise<boolean> {
  const [profile, membership] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { isActive: true } }),
    prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { isActive: true, doNotAssign: true },
    }),
  ]);
  if (!profile?.isActive) return false;
  if (!membership?.isActive) return false;
  if (membership.doNotAssign) return false;
  return true;
}

function logAssignmentOutcome(entry: {
  departmentId: string;
  teamId: string;
  method: AssignmentMethod;
  assigneeId: string | null;
  failed: boolean;
}) {
  // Structured log (NFR-11) — no dedicated logger utility in this codebase;
  // JSON keeps it machine-parseable while matching the existing
  // `console.log("[prefix] ...")` convention used elsewhere.
  console.log(JSON.stringify({ event: "assignment_outcome", ...entry }));
}

/**
 * Resolves a ticket's assignee per the department's configured
 * `assignmentMethod` (ASG-01). `MANUAL` is intentional non-assignment, never
 * a failure. The other three methods report `failed: true` when no eligible
 * agent can be found (ASG-02) — callers must then call
 * `recordAssignmentFailure` after the ticket exists.
 */
export async function autoAssignTicket(params: {
  departmentId: string;
  teamId: string;
  formValues: FormValues;
  excludeUserId: string | null;
}): Promise<AutoAssignResult> {
  const { departmentId, teamId, formValues, excludeUserId } = params;

  const [department, team] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { assignmentMethod: true } }),
    prisma.team.findUnique({ where: { id: teamId }, select: { rotaPointer: true } }),
  ]);
  const method: AssignmentMethod = department?.assignmentMethod ?? "ROUND_ROBIN";

  let result: AutoAssignResult;

  if (method === "MANUAL") {
    result = { assigneeId: null, method, failed: false };
  } else if (method === "RULE_BASED") {
    const rules = await prisma.assignmentRule.findMany({
      where: { departmentId, enabled: true },
      select: { id: true, conditions: true, agentId: true, enabled: true, order: true },
    });
    const candidateId = pickRuleBased(rules as AssignmentRuleLike[], formValues);
    const eligible = candidateId ? await isEligibleTeamMember(candidateId, teamId) : false;
    result = eligible
      ? { assigneeId: candidateId, method, failed: false }
      : { assigneeId: null, method, failed: true };
  } else if (method === "ROUND_ROBIN") {
    const eligible = await getEligibleMembers(teamId, excludeUserId);
    const picked = pickRoundRobin(eligible, team?.rotaPointer ?? 0);
    result = picked
      ? { assigneeId: picked.userId, method, failed: false, nextRotaPointer: picked.nextPointer }
      : { assigneeId: null, method, failed: true };
  } else {
    // WORKLOAD_BASED
    const eligible = await getEligibleMembers(teamId, excludeUserId);
    const counts = await getOpenTicketCounts(teamId, eligible.map((m) => m.userId));
    const assigneeId = pickWorkload(counts);
    result = assigneeId ? { assigneeId, method, failed: false } : { assigneeId: null, method, failed: true };
  }

  logAssignmentOutcome({ departmentId, teamId, method, assigneeId: result.assigneeId, failed: result.failed });
  return result;
}

/**
 * ASG-02/03: records the immutable failure signal (ActivityLog) and notifies
 * every department admin/manager immediately — best-effort, never throws.
 */
export async function recordAssignmentFailure(
  ticketId: string,
  departmentId: string,
  actorId: string,
  ticketTitle: string,
  humanId: string,
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { ticketId, actorId, action: "ASSIGNMENT_FAILED", metadata: { departmentId } },
    });

    const managers = await prisma.departmentManager.findMany({
      where: { departmentId },
      select: { user: { select: { id: true, name: true, email: true } } },
    });

    for (const { user } of managers) {
      createNotification({
        recipientId: user.id,
        type: "assignment_failed_alert",
        ticketId,
        message: "No eligible agent was found for this ticket",
      }).catch(() => undefined);

      sendAssignmentFailedAlertEmail({
        to: user.email,
        managerId: user.id,
        managerName: user.name,
        ticketId,
        humanId,
        ticketTitle,
        departmentId,
      }).catch(() => undefined);
    }
  } catch {
    // best-effort — never block on failure-reporting itself
  }
}
