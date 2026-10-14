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
import { getEligibleMembers, getOpenTicketCounts, isMemberAvailableNow } from "@/lib/rota";
import { pickRoundRobin, pickWorkloadThreshold, type AssignmentRuleLike } from "@/lib/assignment";
import { evaluateConditionGroup, type FormValues } from "@/lib/rules-engine";
import type { AssignmentMethod } from "@/generated/prisma/enums";

export type AutoAssignResult = {
  assigneeId: string | null;
  method: AssignmentMethod;
  failed: boolean;
  /** Rotation cursor — the caller persists this onto SubDepartment.rotaPointer. */
  nextRotaPointer?: number;
};

async function isEligibleSubDepartmentMember(userId: string, teamId: string): Promise<boolean> {
  const [profile, membership] = await Promise.all([
    prisma.profile.findUnique({ where: { id: userId }, select: { isActive: true } }),
    prisma.subDepartmentMembership.findUnique({
      where: { userId_subDepartmentId: { userId, subDepartmentId: teamId } },
      select: { isActive: true, doNotAssign: true },
    }),
  ]);
  if (!profile?.isActive) return false;
  if (!membership?.isActive) return false;
  if (membership.doNotAssign) return false;
  return isMemberAvailableNow(userId, teamId);
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
 * Resolves a ticket's assignee for the sub-department the ticket landed in
 * (ASG-01). Support-form / SLA "concerned" routing and mailbox email creation
 * both pass that sub-department as `teamId`.
 *
 * Method precedence: per-mailbox override → sub-department → per-form →
 * parent department → ROUND_ROBIN. Availability (schedule / holiday /
 * doNotAssign) is always respected — unavailable members are skipped so the
 * next eligible member in the sub-department gets the ticket.
 *
 * `MANUAL` is intentional non-assignment, never a failure. Other methods
 * report `failed: true` when no eligible agent can be found (ASG-02).
 */
export async function autoAssignTicket(params: {
  departmentId: string;
  teamId: string;
  formValues: FormValues;
  excludeUserId: string | null;
  /**
   * The intake form the ticket came from, if any. Used only when the
   * sub-department (and mailbox) inherit — i.e. have no method of their own.
   */
  formConfigId?: string | null;
  /**
   * The mailbox the inbound email arrived at. Its per-mailbox override
   * (MailboxConnection.assignmentMethod) wins over the sub-department method
   * when set. null/absent → no mailbox override.
   */
  mailboxConnectionId?: string | null;
  /**
   * True when an SLA-policy "issue" chose the concerned sub-department for this
   * ticket. It flips form ↔ sub-department precedence:
   *   • issue-routed → the routed sub-department's method wins over the form
   *     (honor the concerned team's rota);
   *   • not issue-routed → the FORM's own method wins over its fallback/default
   *     sub-department (a MANUAL form stays manual instead of inheriting the
   *     sub-department's auto method).
   * Ignored when no form is involved (form method is null either way).
   */
  issueRouted?: boolean;
}): Promise<AutoAssignResult> {
  const { departmentId, teamId, formValues, excludeUserId, formConfigId, mailboxConnectionId, issueRouted = false } = params;

  const [department, subDepartment, form, mailbox] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId }, select: { assignmentMethod: true, workloadThreshold: true } }),
    prisma.subDepartment.findUnique({ where: { id: teamId }, select: { rotaPointer: true, assignmentMethod: true, manualAssigneeIds: true, workloadThreshold: true } }),
    formConfigId
      ? prisma.intakeFormConfig.findUnique({ where: { id: formConfigId }, select: { assignmentMethod: true } })
      : Promise.resolve(null),
    mailboxConnectionId
      ? prisma.mailboxConnection.findUnique({ where: { id: mailboxConnectionId }, select: { assignmentMethod: true, manualAssigneeIds: true } })
      : Promise.resolve(null),
  ]);
  // Precedence, highest first. Mailbox (email) always wins when set. The form ↔
  // sub-department order then depends on how the ticket was routed:
  //   • issue-routed → sub-department → form → department → ROUND_ROBIN
  //     (an SLA "issue" chose the concerned sub-department, so that team's method
  //      wins over the form override).
  //   • not issue-routed → form → sub-department → department → ROUND_ROBIN
  //     (the ticket landed in the form's fallback/default sub-department, so the
  //      form's own method wins — a MANUAL form stays manual).
  // Whichever of form/sub-department is empty is skipped, falling through to the
  // department default and finally ROUND_ROBIN. manualAssigneeIds always comes
  // from the sub-department here (a form has none of its own).
  const subMethod = subDepartment?.assignmentMethod ?? null;
  const formMethod = form?.assignmentMethod ?? null;
  const [firstMethod, secondMethod] = issueRouted
    ? [subMethod, formMethod]
    : [formMethod, subMethod];

  let method: AssignmentMethod;
  let manualAssigneeIds: string[];
  if (mailbox?.assignmentMethod) {
    method = mailbox.assignmentMethod;
    manualAssigneeIds = mailbox.manualAssigneeIds;
  } else {
    method = firstMethod ?? secondMethod ?? department?.assignmentMethod ?? "ROUND_ROBIN";
    manualAssigneeIds = subDepartment?.manualAssigneeIds ?? [];
  }

  let result: AutoAssignResult;

  if (method === "MANUAL") {
    result = { assigneeId: null, method, failed: false };
  } else if (method === "RULE_BASED") {
    // Scope precedence, most specific first: form-scoped rules (formConfigId),
    // then sub-department-scoped, then department-wide (both null).
    const rules = await prisma.assignmentRule.findMany({
      where: {
        departmentId,
        enabled: true,
        OR: [
          ...(formConfigId ? [{ formConfigId }] : []),
          { formConfigId: null, subDepartmentId: teamId },
          { formConfigId: null, subDepartmentId: null },
        ],
      },
      orderBy: [
        { formConfigId: { sort: "desc", nulls: "last" } },
        { subDepartmentId: { sort: "desc", nulls: "last" } },
        { order: "asc" },
      ],
      select: { id: true, conditions: true, agentId: true, enabled: true, order: true },
    });

    // Walk matching rules in order; skip agents who aren't available members of
    // this sub-department (holiday / off-hours / doNotAssign / inactive).
    const ordered = (rules as AssignmentRuleLike[])
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.order - b.r.order || a.i - b.i)
      .map(({ r }) => r);

    let assigneeId: string | null = null;
    let matchedUnavailable = false;
    for (const rule of ordered) {
      if (rule.enabled === false) continue;
      if (!evaluateConditionGroup(rule.conditions, formValues)) continue;
      if (await isEligibleSubDepartmentMember(rule.agentId, teamId)) {
        assigneeId = rule.agentId;
        break;
      }
      matchedUnavailable = true;
    }

    if (assigneeId) {
      result = { assigneeId, method, failed: false };
    } else if (matchedUnavailable) {
      // A rule matched but every candidate was unavailable — jump to the next
      // available member of this sub-department via round-robin.
      const eligible = await getEligibleMembers(teamId, excludeUserId);
      const picked = pickRoundRobin(eligible, subDepartment?.rotaPointer ?? 0);
      result = picked
        ? { assigneeId: picked.userId, method, failed: false, nextRotaPointer: picked.nextPointer }
        : { assigneeId: null, method, failed: true };
    } else {
      result = { assigneeId: null, method, failed: true };
    }
  } else if (method === "ROUND_ROBIN") {
    const eligible = await getEligibleMembers(teamId, excludeUserId, true);
    const picked = pickRoundRobin(eligible, subDepartment?.rotaPointer ?? 0);
    result = picked
      ? { assigneeId: picked.userId, method, failed: false, nextRotaPointer: picked.nextPointer }
      : { assigneeId: null, method, failed: true };
  } else if (method === "MANUAL_SELECT") {
    // Round-robin, but restricted to the hand-picked members configured on the
    // resolving scope. A single selected member means every ticket lands on them
    // when they're available; otherwise the next selected available member.
    const selected = new Set(manualAssigneeIds);
    const eligible = (await getEligibleMembers(teamId, excludeUserId)).filter((m) =>
      selected.has(m.userId),
    );
    const picked = pickRoundRobin(eligible, subDepartment?.rotaPointer ?? 0);
    result = picked
      ? { assigneeId: picked.userId, method, failed: false, nextRotaPointer: picked.nextPointer }
      : { assigneeId: null, method, failed: true };
  } else {
    // WORKLOAD_BASED — among currently available agents only. Rotate through
    // members still under the workload threshold, falling back to the fewest
    // open tickets once everyone is at/over it.
    // The threshold follows the same dept/sub scope the method resolves to: a
    // sub-department that sets its own method uses its own threshold; one that
    // inherits uses the department's. (Form/mailbox method overrides carry no
    // threshold of their own, so they fall back to these too.)
    const workloadThreshold =
      (subDepartment?.assignmentMethod != null
        ? subDepartment?.workloadThreshold
        : department?.workloadThreshold) ??
      subDepartment?.workloadThreshold ??
      department?.workloadThreshold ??
      5;
    const eligible = await getEligibleMembers(teamId, excludeUserId, true);
    const counts = await getOpenTicketCounts(teamId, eligible.map((m) => m.userId));
    const picked = pickWorkloadThreshold(counts, workloadThreshold, subDepartment?.rotaPointer ?? 0);
    result = picked
      ? { assigneeId: picked.userId, method, failed: false, nextRotaPointer: picked.nextPointer }
      : { assigneeId: null, method, failed: true };
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
  subDepartmentId?: string | null,
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { ticketId, actorId, action: "ASSIGNMENT_FAILED", metadata: { departmentId } },
    });

    const managers = await prisma.departmentManager.findMany({
      where: { departmentId },
      select: { user: { select: { id: true, name: true, email: true } } },
    });

    let managerUsers = managers.map((m) => m.user);
    if (subDepartmentId) {
      const subManagers = await prisma.subDepartmentMembership.findMany({
        where: { subDepartmentId, isActive: true, role: "sub_manager" },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      const { resolveEffectiveSubDepartmentManager } = await import("@/lib/role-assignment");
      const effectiveIds = new Set(
        resolveEffectiveSubDepartmentManager({
          subDepartmentManagerUserIds: subManagers.map((m) => m.user.id),
          departmentAdminUserIds: managerUsers.map((u) => u.id),
        }),
      );
      const byId = new Map(
        [...managerUsers, ...subManagers.map((m) => m.user)].map((u) => [u.id, u]),
      );
      managerUsers = [...effectiveIds].map((id) => byId.get(id)).filter((u): u is NonNullable<typeof u> => !!u);
    }

    for (const user of managerUsers) {
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
        subDepartmentId,
      }).catch(() => undefined);
    }
  } catch {
    // best-effort — never block on failure-reporting itself
  }
}
