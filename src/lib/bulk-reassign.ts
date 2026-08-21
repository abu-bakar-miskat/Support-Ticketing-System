/**
 * Bulk reassignment (slice 13, ASG-05/C-05). Snapshots the target ticket ids
 * into a `BulkReassignJob` row at creation time, then processes them off the
 * request path (see the route's `after()` call + the cron sweep). Progress and
 * the result summary both live on that row so a client can poll it.
 *
 * Idempotent-on-retry (C-05) without a queue library: `succeededTicketIds` is
 * the resumability ledger. `runBulkReassignJob` always skips ids already in
 * it, so calling it twice — e.g. the initial `after()` run plus a later cron
 * sweep catching a job that never finished — only does the remaining work.
 */
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { getEligibleMembers } from "@/lib/rota";
import { autoAssignTicket, recordAssignmentFailure } from "@/lib/assignment-engine";
import { createNotification } from "@/lib/notify";
import { ensureProjectMembers } from "@/lib/ensure-project-members";
import type { BulkReassignTargetType } from "@/generated/prisma/enums";

export type CreateBulkReassignJobParams = {
  tenantId: string;
  departmentId: string;
  createdById: string;
  sourceAssigneeId: string;
  targetType: BulkReassignTargetType;
  targetAgentId?: string | null;
  targetTeamId?: string | null;
  /** Restrict the snapshot to these teams (caller's dept scope); all department teams when omitted. */
  scopeTeamIds?: string[] | null;
};

/** Snapshots the source agent's currently-open tickets (within scope) as the job's work list. */
export async function createBulkReassignJob(params: CreateBulkReassignJobParams) {
  const { tenantId, departmentId, createdById, sourceAssigneeId, targetType, targetAgentId, targetTeamId, scopeTeamIds } = params;

  const teams = await prisma.subDepartment.findMany({
    where: { departmentId, ...(scopeTeamIds ? { id: { in: scopeTeamIds } } : {}) },
    select: { id: true },
  });
  const teamIds = teams.map((t) => t.id);

  const tickets = teamIds.length
    ? await prisma.ticket.findMany({
        where: { assigneeId: sourceAssigneeId, subDepartmentId: { in: teamIds }, deletedAt: null, closedAt: null },
        select: { id: true },
      })
    : [];

  return prisma.bulkReassignJob.create({
    data: {
      tenantId,
      departmentId,
      createdById,
      sourceAssigneeId,
      targetType,
      targetAgentId: targetAgentId ?? null,
      targetTeamId: targetTeamId ?? null,
      ticketIds: tickets.map((t) => t.id),
    },
  });
}

/** Processes every not-yet-succeeded ticket in the job, then marks it COMPLETED with a result summary. */
export async function runBulkReassignJob(jobId: string): Promise<void> {
  const job = await prisma.bulkReassignJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "COMPLETED") return;

  await prisma.bulkReassignJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: job.startedAt ?? new Date() },
  });

  const remainingIds = job.ticketIds.filter((id) => !job.succeededTicketIds.includes(id));
  const tickets = remainingIds.length
    ? await prisma.ticket.findMany({
        where: { id: { in: remainingIds } },
        select: {
          id: true,
          title: true,
          subDepartmentId: true,
          assigneeId: true,
          projectId: true,
          ticketNumber: true,
          subDepartment: { select: { prefix: true } },
        },
      })
    : [];

  // GROUP: round-robin the source agent's tickets across the target team's
  // eligible members — computed once so the distribution spreads evenly
  // across this job's tickets, not re-derived per ticket.
  let groupMemberIds: string[] = [];
  if (job.targetType === "GROUP" && job.targetTeamId) {
    groupMemberIds = (await getEligibleMembers(job.targetTeamId, null)).map((m) => m.userId);
  }

  const errors: { ticketId: string; error: string }[] = [];

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    try {
      let newAssigneeId: string | null = null;
      let assignmentFailed = false;

      if (job.targetType === "SINGLE_AGENT") {
        newAssigneeId = job.targetAgentId;
      } else if (job.targetType === "GROUP") {
        if (groupMemberIds.length === 0) {
          assignmentFailed = true;
        } else {
          newAssigneeId = groupMemberIds[i % groupMemberIds.length];
        }
      } else {
        // DEPARTMENT_POOL — unassign, then let the department's configured
        // method (RULE_BASED/ROUND_ROBIN/WORKLOAD_BASED/MANUAL) re-route it.
        const result = await autoAssignTicket({
          departmentId: job.departmentId,
          teamId: ticket.subDepartmentId,
          formValues: {},
          excludeUserId: null,
        });
        newAssigneeId = result.assigneeId;
        assignmentFailed = result.failed;
        if (result.nextRotaPointer !== undefined) {
          await prisma.subDepartment.update({ where: { id: ticket.subDepartmentId }, data: { rotaPointer: result.nextRotaPointer } });
        }
      }

      const previousAssigneeId = ticket.assigneeId;
      await prisma.ticket.update({ where: { id: ticket.id }, data: { assigneeId: newAssigneeId } });

      if (assignmentFailed) {
        await recordAssignmentFailure(
          ticket.id,
          job.departmentId,
          job.createdById,
          ticket.title,
          `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
          ticket.subDepartmentId,
        );
      } else if (newAssigneeId && newAssigneeId !== previousAssigneeId) {
        await prisma.activityLog.create({
          data: {
            ticketId: ticket.id,
            actorId: job.createdById,
            action: "ASSIGNED",
            metadata: { fromId: previousAssigneeId, toId: newAssigneeId, bulkReassignJobId: jobId },
          },
        });
        createNotification({
          recipientId: newAssigneeId,
          actorId: job.createdById,
          type: "assignment",
          ticketId: ticket.id,
          message: ticket.title,
        }).catch(() => undefined);
        if (ticket.projectId) ensureProjectMembers(ticket.projectId, [newAssigneeId]).catch(() => undefined);
      }

      await prisma.bulkReassignJob.update({
        where: { id: jobId },
        data: { succeededTicketIds: { push: ticket.id } },
      });
    } catch (err) {
      errors.push({ ticketId: ticket.id, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const final = await prisma.bulkReassignJob.findUnique({ where: { id: jobId }, select: { succeededTicketIds: true, ticketIds: true } });
  await prisma.bulkReassignJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      resultSummary: {
        total: final?.ticketIds.length ?? job.ticketIds.length,
        succeeded: final?.succeededTicketIds.length ?? 0,
        failed: errors.length,
        errors,
      },
    },
  });
}

/** Runs the job under system scope — for the route's `after()` kick-off and the cron sweep. */
export function runBulkReassignJobAsSystem(jobId: string): Promise<void> {
  return runAsSystem(() => runBulkReassignJob(jobId));
}

/**
 * Resumes any job that never finished — the initial `after()` run may not
 * have completed (function killed, deploy, etc). Safe to call repeatedly:
 * `runBulkReassignJob` is a no-op for an already-COMPLETED job and skips
 * already-succeeded tickets within an in-progress one.
 */
export async function sweepStuckBulkReassignJobs(staleAfterMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const stuck = await prisma.bulkReassignJob.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "RUNNING", startedAt: { lt: cutoff } }],
    },
    select: { id: true },
  });
  for (const { id } of stuck) {
    await runBulkReassignJobAsSystem(id);
  }
  return stuck.length;
}
