import "server-only";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { runAsSystem } from "@/lib/request-scope";
import { pullContextFor } from "@/lib/mailbox-connection";
import { sendMimeAsMailbox } from "@/lib/mail-providers/m365-provider";
import type { OAuthMailboxCredentials, PullContext } from "@/lib/mail-providers/types";
import { isOutboundEmailDevMode, sendOutboundEmail, type OutboundEmail } from "@/lib/email-transport";

/**
 * All tenant email goes out through Microsoft 365 mailboxes.
 *
 * A tenant, each department and each sub-department may connect one mailbox.
 * An email about something in a sub-department is sent from the most specific
 * mailbox available — sub-department → department → tenant — with Reply-To the
 * same address, so recipients (customers, staff, invitees) only ever deal with
 * that one address and replies land in a mailbox the sync reads. Only when no
 * mailbox applies does the email fall back to the platform sender (Resend);
 * login codes and super-admin invites always use the platform sender.
 */

export type ReplyMailbox = { id: string; address: string; credentialsRef: string | null };

export type MailScope = {
  tenantId?: string | null;
  departmentId?: string | null;
  subDepartmentId?: string | null;
};

const SENDER_SELECT = { id: true, address: true, credentialsRef: true } as const;

/** Sub-department's mailbox, else department's, else tenant's, else null (→ platform sender). */
export async function resolveSenderMailbox(scope: MailScope): Promise<ReplyMailbox | null> {
  const { subDepartmentId } = scope;
  let { tenantId, departmentId } = scope;
  if (!tenantId && !departmentId && !subDepartmentId) return null;
  // Id-keyed lookups; callers already authorized the action. Webhooks and
  // crons send these too, so don't depend on a request tenant scope.
  return runAsSystem(async () => {
    const find = (where: Record<string, unknown>) =>
      prisma.mailboxConnection.findFirst({
        where: { authType: "OAUTH_M365", ...where },
        orderBy: { createdAt: "asc" },
        select: SENDER_SELECT,
      });

    if (subDepartmentId) {
      const own = await find({ scopeType: "SUB_DEPARTMENT", subDepartmentId });
      if (own) return own;
      if (!departmentId || !tenantId) {
        const sub = await prisma.subDepartment.findUnique({
          where: { id: subDepartmentId },
          select: { departmentId: true, tenantId: true },
        });
        departmentId ??= sub?.departmentId;
        tenantId ??= sub?.tenantId;
      }
    }
    if (departmentId) {
      const dept = await find({ scopeType: "DEPARTMENT", departmentId });
      if (dept) return dept;
      if (!tenantId) {
        const row = await prisma.department.findUnique({ where: { id: departmentId }, select: { tenantId: true } });
        tenantId = row?.tenantId;
      }
    }
    return tenantId ? find({ scopeType: "TENANT", tenantId }) : null;
  });
}

/** @deprecated name kept for existing callers — same as {@link resolveSenderMailbox}. */
export function resolveReplyMailbox(
  departmentId: string | null | undefined,
  subDepartmentId: string | null | undefined,
): Promise<ReplyMailbox | null> {
  return resolveSenderMailbox({ departmentId, subDepartmentId });
}

/**
 * The Microsoft 365 mailbox already connected at exactly this scope, if any.
 * A tenant, a department and a sub-department may each have at most one.
 */
export async function findScopeMailbox(
  scope:
    | { scopeType: "TENANT"; tenantId: string }
    | { scopeType: "DEPARTMENT"; departmentId: string }
    | { scopeType: "SUB_DEPARTMENT"; subDepartmentId: string },
): Promise<{ id: string; address: string } | null> {
  const where =
    scope.scopeType === "TENANT"
      ? { scopeType: "TENANT" as const, tenantId: scope.tenantId }
      : scope.scopeType === "DEPARTMENT"
        ? { scopeType: "DEPARTMENT" as const, departmentId: scope.departmentId }
        : { scopeType: "SUB_DEPARTMENT" as const, subDepartmentId: scope.subDepartmentId };
  return runAsSystem(() =>
    prisma.mailboxConnection.findFirst({
      where: { authType: "OAUTH_M365", ...where },
      select: { id: true, address: true },
    }),
  );
}

export type MailboxSendResult =
  | { ok: true; messageId: string; fromEmail: string }
  | { ok: false; error: string };

/**
 * Sends `message` as `mailbox`. `from` keeps its display name but its address
 * becomes the mailbox; Reply-To is forced to the mailbox. In platform dev mode
 * the message goes to Mailpit instead, like all other business mail.
 */
export async function sendViaReplyMailbox(
  mailbox: ReplyMailbox,
  message: Omit<OutboundEmail, "replyTo">,
): Promise<MailboxSendResult> {
  const displayName = message.from.match(/^\s*(.*?)\s*<[^>]+>\s*$/)?.[1]?.replace(/^["']|["']$/g, "");
  const from = displayName ? { name: displayName, address: mailbox.address } : mailbox.address;
  const domain = mailbox.address.split("@")[1] ?? "localhost";
  const messageId = `<${randomUUID()}@${domain}>`;

  if (await isOutboundEmailDevMode()) {
    const result = await sendOutboundEmail({
      ...message,
      from: typeof from === "string" ? from : `${from.name} <${from.address}>`,
      replyTo: mailbox.address,
      headers: { ...message.headers, "Message-ID": messageId },
    });
    return result.ok ? { ok: true, messageId, fromEmail: mailbox.address } : { ok: false, error: result.error };
  }

  try {
    const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
    const built = await composer.sendMail({
      from,
      to: message.to,
      replyTo: mailbox.address,
      subject: message.subject,
      html: message.html,
      text: message.text,
      messageId,
      headers: message.headers,
      attachments: message.attachments,
    });
    const ctx = pullContextFor(mailbox) as PullContext<OAuthMailboxCredentials>;
    await sendMimeAsMailbox(ctx, built.message as Buffer);
    return { ok: true, messageId, fromEmail: mailbox.address };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't send from the connected mailbox" };
  }
}
