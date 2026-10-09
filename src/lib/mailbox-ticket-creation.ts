import "server-only";
import { prisma } from "@/lib/db";
import { autoAssignTicket, recordAssignmentFailure } from "@/lib/assignment-engine";
import { getSubDepartmentStatuses } from "@/lib/board-data";
import { resolveSupportProjectForDepartment } from "@/lib/support-project";
import { ensureSystemUser } from "@/lib/intake-conversion";
import { ensureProjectMembers } from "@/lib/ensure-project-members";
import { applyRulesToTicket } from "@/lib/rule-executor";
import { createNotification } from "@/lib/notify";
import { sendAssignmentEmail } from "@/lib/email";
import { startMailboxSlaTimer } from "@/lib/sla-engine";
import { assertDepartmentOperational, DepartmentNotOperationalError } from "@/lib/department-setup";
import { TicketPriority } from "@/generated/prisma/enums";
import { mailboxOriginIdsWhere, mailboxOriginRouting } from "@/lib/mailbox-ticket-origin";
import type { Prisma } from "@/generated/prisma/client";

/**
 * EM-01/02/03: creates a brand-new ticket from an inbound email that matched
 * a configured `MailboxConnection` (no reply-token/header/subject match to an
 * existing ticket). Mirrors the ticket-creation block in
 * lib/intake-conversion.ts's runConversion — same ticketNumber-by-trigger,
 * board-column resolution and auto-assignment — but there
 * is no Intake/form submission behind it, so it's simpler: no responses, no
 * versioned form values.
 */
export type CreateTicketFromEmailResult = {
  id: string;
  ticketNumber: number;
  subDepartmentPrefix: string;
  creatorId: string;
  assigneeId: string | null;
};

/**
 * Another run (Resend's at-least-once webhook, or the webhook racing the
 * on-open reconcile) already stored this email — and with it, its ticket.
 */
export class DuplicateInboundEmailError extends Error {
  constructor() {
    super("Inbound email already stored");
    this.name = "DuplicateInboundEmailError";
  }
}

/**
 * A mailbox was switched off after the inbound router resolved its address but
 * before this email could open a ticket. This is an expected drop, not a
 * provider failure worth retrying.
 */
export class MailboxInactiveError extends Error {
  constructor() {
    super("Mailbox is inactive");
    this.name = "MailboxInactiveError";
  }
}

export async function createTicketFromInboundEmail(params: {
  departmentId: string;
  teamId: string;
  fromEmail: string;
  fromName: string;
  subject: string | null;
  /** Parsed email body (sanitized HTML) to seed the ticket description with. */
  description?: string | null;
  /** The mailbox this email arrived at — its per-mailbox assignment override
   *  (if any) takes precedence over the sub-department's method. */
  mailboxConnectionId?: string | null;
  /** Routing metadata for the creation audit; the body lives only in description. */
  inboundMessage: {
    providerMessageIds: string[];
    data: Omit<Prisma.TicketMessageUncheckedCreateInput, "ticketId"> & { providerMessageId: string };
  };
}): Promise<CreateTicketFromEmailResult> {
  const { departmentId, teamId, fromEmail, fromName, subject, description, mailboxConnectionId, inboundMessage } = params;

  // DS-08: a department blocks ticket creation until its initial setup review is complete.
  const setupCheck = await assertDepartmentOperational(departmentId);
  if (!setupCheck.ok) throw new DepartmentNotOperationalError(setupCheck.error);

  const [subDepartment, statuses, projectId, creatorId, managerRow] = await Promise.all([
    prisma.subDepartment.findUniqueOrThrow({ where: { id: teamId }, select: { tenantId: true, prefix: true } }),
    getSubDepartmentStatuses(teamId),
    resolveSupportProjectForDepartment(departmentId),
    ensureSystemUser(),
    prisma.departmentManager.findFirst({ where: { departmentId }, select: { userId: true } }),
  ]);
  const status = statuses[0]?.label ?? "Not Started";
  const title = subject?.trim() || `Email from ${fromName || fromEmail}`;

  const assignResult = await autoAssignTicket({
    departmentId,
    teamId,
    formValues: {},
    excludeUserId: managerRow?.userId ?? null,
    mailboxConnectionId,
  });

  const ticket = await prisma.$transaction(async (tx) => {
    // Serialize duplicate deliveries; the ticket and origin metadata commit together.
    // $executeRaw: pg_advisory_xact_lock returns `void`, which the adapter can't read.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${inboundMessage.data.providerMessageId}))`;
    const dup = await tx.ticketMessage.findFirst({
      where: { providerMessageId: { in: inboundMessage.providerMessageIds } },
      select: { id: true },
    });
    const origin = await tx.activityLog.findFirst({
      where: mailboxOriginIdsWhere(inboundMessage.providerMessageIds),
      select: { id: true },
    });
    if (dup || origin) throw new DuplicateInboundEmailError();

    // The router also checks `isActive`, but that read can become stale while
    // parsing/assignment is in progress. Lock this connection row at the point
    // of creation so a concurrent off-toggle and ticket creation are ordered:
    // whichever obtains the row lock first determines whether this email was
    // accepted before or after the mailbox was paused.
    if (mailboxConnectionId) {
      const [connection] = await tx.$queryRaw<{ isActive: boolean }[]>`
        SELECT "isActive"
        FROM "MailboxConnection"
        WHERE "id" = ${mailboxConnectionId}
          AND "departmentId" = ${departmentId}
          AND "teamId" = ${teamId}
        FOR UPDATE
      `;
      if (!connection?.isActive) throw new MailboxInactiveError();
    }

    const created = await tx.ticket.create({
      data: {
        title,
        description: description?.trim() ? description : null,
        type: "Task",
        priority: TicketPriority.Medium,
        status,
        ticketNumber: 0, // stamped by DB trigger
        creatorId,
        tenantId: subDepartment.tenantId,
        subDepartmentId: teamId,
        projectId,
        assigneeId: assignResult.assigneeId,
      },
      select: { id: true, ticketNumber: true },
    });

    await tx.activityLog.create({
      data: {
        ticketId: created.id,
        actorId: creatorId,
        action: "TICKET_CREATED",
        metadata: {
          source: "email", fromEmail, fromName,
          providerMessageId: inboundMessage.data.providerMessageId,
          rawPayload: mailboxOriginRouting(inboundMessage.data.rawPayload),
        },
      },
    });

    if (assignResult.nextRotaPointer !== undefined) {
      await tx.subDepartment.update({ where: { id: teamId }, data: { rotaPointer: assignResult.nextRotaPointer } });
    }

    return created;
  });

  if (assignResult.assigneeId && projectId) {
    await ensureProjectMembers(projectId, [assignResult.assigneeId]).catch(() => undefined);
  }

  // The ticket is already committed above, so these follow-up steps are
  // best-effort: a throw here must not bubble out of this function, or the
  // inbound webhook would treat a fully-created ticket as a failure and retry
  // it. The creation audit already gates idempotency; log and move on instead.
  const ruleFormValues = {
    title,
    subject: subject ?? "",
    fromEmail,
    fromName,
    priority: TicketPriority.Medium,
  };
  // Shared-mailbox SLA: the department's flat mailbox targets (if set).
  // Best-effort, never throws.
  await startMailboxSlaTimer(ticket.id, subDepartment.tenantId, departmentId);

  // RE-01/02: run the department's automation rules on the inbound-email ticket.
  await applyRulesToTicket(
    {
      id: ticket.id,
      tenantId: subDepartment.tenantId,
      departmentId,
      subDepartmentId: teamId,
      assigneeId: assignResult.assigneeId,
      // Mailbox tickets only use the department's shared-mailbox SLA (started
      // above) — never form SLA policies, including through automation.
      allowSla: false,
    },
    ruleFormValues,
  ).catch((err) => console.error("[inbound] applyRulesToTicket failed for", ticket.id, err));

  const humanId = `${subDepartment.prefix}-${ticket.ticketNumber}`;

  // Also post-commit and therefore best-effort (see the note above): the
  // assignment notification must never surface as a failure of the whole
  // creation and trigger a retry/duplicate.
  try {
    if (assignResult.failed) {
      await recordAssignmentFailure(ticket.id, departmentId, creatorId, title, humanId, teamId);
    } else if (assignResult.assigneeId) {
      const assignee = await prisma.profile.findUnique({
        where: { id: assignResult.assigneeId },
        select: { id: true, name: true, email: true },
      });
      if (assignee) {
        createNotification({
          recipientId: assignee.id,
          type: "assignment",
          ticketId: ticket.id,
          message: title,
        }).catch(() => undefined);
        sendAssignmentEmail({
          to: assignee.email,
          assigneeName: assignee.name,
          assigneeId: assignee.id,
          ticketId: ticket.id,
          humanId,
          ticketTitle: title,
          assignedByName: "System",
          assignedById: creatorId,
          departmentId,
          subDepartmentId: teamId,
        }).catch(() => undefined);
      }
    }
  } catch (err) {
    console.error("[inbound] assignment notification failed for", ticket.id, err);
  }

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subDepartmentPrefix: subDepartment.prefix,
    creatorId,
    assigneeId: assignResult.assigneeId,
  };
}
