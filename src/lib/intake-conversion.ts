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
import { getSubDepartmentStatuses } from "@/lib/board-data";
import { generateReplyToken } from "@/lib/customer-conversation";
import { autoAssignTicket } from "@/lib/assignment-engine";
import { ensureProjectMembers } from "@/lib/ensure-project-members";
import { assertDepartmentOperational } from "@/lib/department-setup";

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
  intakeSubDepartmentId: string;
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
  // ASG-02/03 (slice 11): true when the sub-department's auto-assignment method
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
  intakeSubDepartmentId,
  departmentId,
  responses,
  priority,
  submitterName,
  title = "",
  issueRouted = false,
}: {
  formId: string;
  formName: string;
  intakeSubDepartmentId: string;
  departmentId: string;
  responses: ResponseEntry[];
  priority: TicketPriority;
  submitterName: string;
  title?: string;
  // True when the sub-department was chosen by the selected SLA "issue" (vs the
  // form's fallback/default). Controls form ↔ sub-department method precedence.
  issueRouted?: boolean;
}): Promise<ConversionPrep> {
  const subDepartment = await prisma.subDepartment.findUniqueOrThrow({
    where: { id: intakeSubDepartmentId },
    select: { rotaPointer: true, workloadThreshold: true },
  });

  // DS-08: a department blocks ticket creation until its initial setup review is complete.
  const setupCheck = await assertDepartmentOperational(departmentId);
  if (!setupCheck.ok) throw new Error(setupCheck.error);

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

  // Ticket starts in the subDepartment's first configured status.
  const statuses = await getSubDepartmentStatuses(intakeSubDepartmentId);
  const status = statuses[0]?.label ?? "Not Started";

  let assigneeId: string | null = null;
  let nextPointer = subDepartment.rotaPointer;
  let assignmentFailed = false;

  // Tickets land in a sub-department and are assigned using the resolved method
  // among currently available members. The engine's form ↔ sub-department
  // precedence depends on issueRouted: an issue-routed ticket honors the
  // concerned sub-department's method (over the form), while a ticket that fell
  // back to the form's default sub-department honors the *form's* own method —
  // so a "Manual" form stays manual. A resolved MANUAL is an intentional
  // non-assignment (no assignee, no failure). We always let the engine run
  // rather than gating on the form's autoAssign flag, so an issue-routed ticket
  // still gets picked up by its team's auto method.
  const formValues = Object.fromEntries(responses.map((r) => [r.fieldId, r.value]));
  const result = await autoAssignTicket({
    departmentId,
    teamId: intakeSubDepartmentId,
    formValues,
    excludeUserId: managerId,
    formConfigId: formId,
    issueRouted,
  });
  assigneeId = result.assigneeId;
  assignmentFailed = result.failed;
  if (result.nextRotaPointer !== undefined) nextPointer = result.nextRotaPointer;

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
    intakeSubDepartmentId,
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
  estimatedMinutes: number | null = null,
  schema?: { schemaVersion: number; fieldSnapshot: Prisma.InputJsonValue },
): Promise<{ intakeId: string; ticketId: string; replyToken: string }> {
  const intake = await tx.intake.create({
    data: {
      formConfigId: formId,
      submitterName,
      submitterEmail,
      priority: prep.priority,
      ...(estimatedMinutes !== null ? { estimatedHours: Math.round(estimatedMinutes / 60) } : {}),
      responses: storedResponses as Prisma.InputJsonValue,
      replyToken: generateReplyToken(),
      ...(schema
        ? { schemaVersion: schema.schemaVersion, fieldSnapshot: schema.fieldSnapshot }
        : {}),
    },
    select: { id: true, replyToken: true },
  });

  const intakeSubDepartment = await tx.subDepartment.findUnique({
    where: { id: prep.intakeSubDepartmentId },
    select: { tenantId: true },
  });
  if (!intakeSubDepartment) {
    throw new Error(`Intake subDepartment ${prep.intakeSubDepartmentId} not found`);
  }

  const ticket = await tx.ticket.create({
    data: {
      title: prep.title,
      description: prep.description,
      type: "Task",
      priority: prep.priority,
      status: prep.status,
      ticketNumber: 0, // stamped by DB trigger
      creatorId: prep.creatorId,
      tenantId: intakeSubDepartment.tenantId,
      subDepartmentId: prep.intakeSubDepartmentId,
      projectId: prep.projectId,
      assigneeId: prep.assigneeId,
      ...(estimatedMinutes !== null ? { estimatedTime: estimatedMinutes } : {}),
    },
    select: {
      id: true,
      ticketNumber: true,
      subDepartment: { select: { prefix: true } },
    },
  });

  await tx.activityLog.create({
    data: {
      ticketId: ticket.id,
      actorId: prep.creatorId,
      action: "TICKET_CREATED",
      metadata: {
        humanId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
        title: prep.title,
        status: prep.status,
        // The ticket is authored by the System user; keep the real requester on
        // the entry so the activity feed can show who it was submitted for.
        submitterName,
        submitterEmail,
      },
    },
  });

  await tx.intake.update({
    where: { id: intake.id },
    data: { ticketId: ticket.id },
  });

  await tx.subDepartment.update({
    where: { id: prep.intakeSubDepartmentId },
    data: { rotaPointer: prep.newRotaPointer },
  });

  await ensureProjectMembers(prep.projectId, [prep.assigneeId], tx);

  return { intakeId: intake.id, ticketId: ticket.id, replyToken: intake.replyToken! };
}
