/**
 * Intake → Ticket auto-conversion with ROTA assignment.
 *
 * Call prepareConversion() BEFORE the transaction to load state and resolve
 * the ROTA assignee (read-only). Then pass the result into runConversion()
 * inside a prisma.$transaction callback.
 */

import { prisma } from "@/lib/db";
import type { Prisma, TicketPriority } from "@/generated/prisma/client";
import { resolveSupportProjectForDepartment } from "@/lib/support-project";
import { getTeamStatuses } from "@/lib/board-data";
import { generateReplyToken } from "@/lib/customer-conversation";
import { autoAssignTicket } from "@/lib/assignment-engine";
import { ensureProjectMembers } from "@/lib/ensure-project-members";
import { resolveColumnIdForStatus } from "@/lib/board-columns";

// Fixed UUID for the synthetic "System" profile used as the creator of
// tickets auto-converted from intake form submissions.
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

const SYSTEM_USER_EMAIL = "system@internal.local";

export async function ensureSystemUser(): Promise<string> {
  const existing = await prisma.profile.findUnique({
    where: { email: SYSTEM_USER_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.profile.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      email: SYSTEM_USER_EMAIL,
      name: "System",
      role: "admin",
    },
  });
  return created.id;
}

type ResponseEntry = {
  fieldId: string;
  label: string;
  type: string;
  value: string;
};

export type ConversionPrep = {
  intakeTeamId: string;
  departmentId: string;
  formName: string;
  title: string;
  description: string;
  status: string;
  priority: TicketPriority;
  creatorId: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  managers: { id: string; name: string | null; email: string | null }[];
  projectId: string;
  newRotaPointer: number;
  // Set only when the ticket was assigned via a specific issue's round-robin
  // pool (2+ assignees). Tells runConversion to advance that issue's cursor
  // instead of the team ROTA.
  rotaIssueId?: string | null;
  newIssueRotaPointer?: number | null;
  // ASG-02/03 (slice 11): true when the department's auto-assignment method
  // found no eligible agent. The ticket is still created (unassigned) —
  // callers must report the failure once the ticket exists.
  assignmentFailed: boolean;
};

// ─── Build ticket title from responses ───────────────────────────────────────

function resolveTitle(
  responses: ResponseEntry[],
  formName: string,
  submitterName: string,
  explicitTitle: string,
): string {
  // An explicit title from the form's Title field wins, used verbatim.
  if (explicitTitle.trim()) return explicitTitle.trim();

  const subjectEntry = responses.find((r) =>
    /^(subject|title|topic)$/i.test(r.label.trim()),
  );
  const subject = (subjectEntry?.value ?? "").trim();
  return subject
    ? `[${formName}] ${subject} — ${submitterName}`
    : `${formName} — ${submitterName}`;
}

// ─── Build HTML description from responses ────────────────────────────────────

function buildDescription(
  responses: ResponseEntry[],
  submitterName: string,
): string {
  const rows = responses
    .filter((r) => r.value && r.value.trim())
    .map((r) => `<p><strong>${r.label}:</strong> ${r.value}</p>`)
    .join("\n");
  return `<p><em>Submitted by ${submitterName}</em></p>\n${rows}`;
}

// ─── Public: prepare all data before the transaction ─────────────────────────

export async function prepareConversion({
  formId,
  formName,
  intakeTeamId,
  departmentId,
  responses,
  priority,
  submitterName,
  title = "",
  autoAssign = true,
  issueId = null,
  issueAssigneeIds = [],
  issueRotaPointer = 0,
}: {
  formId: string;
  formName: string;
  intakeTeamId: string;
  departmentId: string;
  responses: ResponseEntry[];
  priority: TicketPriority;
  submitterName: string;
  title?: string;
  autoAssign?: boolean;
  /** The chosen issue (if any) whose assignee pool drives assignment. */
  issueId?: string | null;
  /** Users assigned to that issue (department-scoped). Empty → team ROTA. */
  issueAssigneeIds?: string[];
  /** Round-robin cursor stored on the issue. */
  issueRotaPointer?: number;
}): Promise<ConversionPrep> {
  const team = await prisma.team.findUniqueOrThrow({
    where: { id: intakeTeamId },
    select: { rotaPointer: true, workloadThreshold: true },
  });

  // Every department manager is alerted (email + in-app notification) once the
  // ticket is created — separate from who the ticket's creator is. The
  // earliest-assigned manager is also excluded from ROTA auto-assignment below.
  const managerRows = await prisma.departmentManager.findMany({
    where: { departmentId },
    orderBy: { assignedAt: "asc" },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  const managers = managerRows.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
  }));
  const managerId = managers[0]?.id ?? null;

  // Ticket starts in the team's first configured status.
  const statuses = await getTeamStatuses(intakeTeamId);
  const status = statuses[0]?.label ?? "Not Started";

  let assigneeId: string | null = null;
  let nextPointer = team.rotaPointer;
  let newIssueRotaPointer: number | null = null;
  let assignmentFailed = false;

  if (autoAssign) {
    if (issueAssigneeIds.length > 0) {
      // Per-issue assignment (department-scoped): a single assignee goes direct;
      // multiple assignees round-robin via the issue's own cursor. The team ROTA
      // (and its pointer) is left untouched in this path.
      const idx = issueAssigneeIds.length === 1 ? 0 : issueRotaPointer % issueAssigneeIds.length;
      assigneeId = issueAssigneeIds[idx];
      if (issueAssigneeIds.length > 1) {
        newIssueRotaPointer = (issueRotaPointer + 1) % issueAssigneeIds.length;
      }
    } else {
      // Slice 11 (ASG-01): the department's configured assignment method
      // (rule-based / round-robin / workload-based / manual) picks the agent.
      const formValues = Object.fromEntries(responses.map((r) => [r.fieldId, r.value]));
      const result = await autoAssignTicket({
        departmentId,
        teamId: intakeTeamId,
        formValues,
        excludeUserId: managerId,
      });
      assigneeId = result.assigneeId;
      assignmentFailed = result.failed;
      if (result.nextRotaPointer !== undefined) nextPointer = result.nextRotaPointer;
    }
  }

  const assigneeProfile = assigneeId
    ? await prisma.profile.findUniqueOrThrow({
        where: { id: assigneeId },
        select: { name: true, email: true },
      })
    : null;

  // Support tickets are always created by the synthetic "System" user — the
  // intake originates from the submitter, not a staff member, so attributing
  // authorship to the auto-assigned agent would be misleading. The assignee
  // (if any) is still set separately below.
  const creatorId = await ensureSystemUser();

  const projectId = await resolveSupportProjectForDepartment(departmentId);

  return {
    intakeTeamId,
    departmentId,
    formName,
    title: resolveTitle(responses, formName, submitterName, title),
    description: buildDescription(responses, submitterName),
    status,
    priority,
    creatorId,
    assigneeId,
    assigneeName: assigneeProfile?.name ?? null,
    assigneeEmail: assigneeProfile?.email ?? null,
    managers,
    projectId,
    newRotaPointer: nextPointer,
    rotaIssueId: newIssueRotaPointer !== null ? issueId : null,
    newIssueRotaPointer,
    assignmentFailed,
  };
}

// ─── Public: write inside a transaction ──────────────────────────────────────

export async function runConversion(
  tx: Prisma.TransactionClient,
  prep: ConversionPrep,
  submitterName: string,
  submitterEmail: string,
  idempotencyKey: string | null,
  storedResponses: unknown[],
  formId: string,
  estimatedHours: number | null = null,
): Promise<{ intakeId: string; ticketId: string; replyToken: string }> {
  const intake = await tx.intake.create({
    data: {
      formConfigId: formId,
      submitterName,
      submitterEmail,
      priority: prep.priority,
      ...(estimatedHours !== null ? { estimatedHours } : {}),
      responses: storedResponses as Prisma.InputJsonValue,
      replyToken: generateReplyToken(),
    },
    select: { id: true, replyToken: true },
  });

  const intakeTeam = await tx.team.findUnique({
    where: { id: prep.intakeTeamId },
    select: { tenantId: true },
  });
  if (!intakeTeam) {
    throw new Error(`Intake team ${prep.intakeTeamId} not found`);
  }

  // Place the intake ticket in a column of its department's board (DAT-03).
  const boardColumnId = await resolveColumnIdForStatus(tx, {
    departmentId: prep.departmentId,
    status: prep.status,
  });

  const ticket = await tx.ticket.create({
    data: {
      title: prep.title,
      description: prep.description,
      type: "Task",
      priority: prep.priority,
      status: prep.status,
      ticketNumber: 0, // stamped by DB trigger
      creatorId: prep.creatorId,
      tenantId: intakeTeam.tenantId,
      teamId: prep.intakeTeamId,
      projectId: prep.projectId,
      assigneeId: prep.assigneeId,
      ...(boardColumnId ? { boardColumnId } : {}),
      ...(estimatedHours !== null ? { estimatedTime: estimatedHours * 60 } : {}),
    },
    select: {
      id: true,
      ticketNumber: true,
      team: { select: { prefix: true } },
    },
  });

  await tx.activityLog.create({
    data: {
      ticketId: ticket.id,
      actorId: prep.creatorId,
      action: "TICKET_CREATED",
      metadata: {
        humanId: `${ticket.team.prefix}-${ticket.ticketNumber}`,
        title: prep.title,
        status: prep.status,
      },
    },
  });

  await tx.intake.update({
    where: { id: intake.id },
    data: { ticketId: ticket.id },
  });

  await tx.team.update({
    where: { id: prep.intakeTeamId },
    data: { rotaPointer: prep.newRotaPointer },
  });

  // When assignment came from a specific issue's round-robin pool, advance that
  // issue's cursor (the team pointer above is unchanged in that path).
  if (prep.rotaIssueId && prep.newIssueRotaPointer !== null && prep.newIssueRotaPointer !== undefined) {
    await tx.intakeIssue.update({
      where: { id: prep.rotaIssueId },
      data: { assigneeRotaPointer: prep.newIssueRotaPointer },
    });
  }

  await ensureProjectMembers(prep.projectId, [prep.assigneeId], tx);

  return { intakeId: intake.id, ticketId: ticket.id, replyToken: intake.replyToken! };
}
