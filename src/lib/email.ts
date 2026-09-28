import { Resend } from "resend";
import { brandingFrom, fromHeader, getEmailConfig, getEmailTemplateOverrides } from "./email-config";
import { buildReplyToAddress } from "./customer-conversation";
import { renderCustomerReply } from "./email-templates/customer-reply";
import { renderAssignment } from "./email-templates/assignment";
import { renderIntakeConfirmation } from "./email-templates/intake-confirmation";
import { renderIntakeVerification } from "./email-templates/intake-verification";
import { renderIntakeManagerAlert } from "./email-templates/intake-manager-alert";
import { renderAssignmentFailedAlert } from "./email-templates/assignment-failed-alert";
import { renderMailboxConnectionFailedAlert } from "./email-templates/mailbox-connection-failed-alert";
import { renderInvite } from "./email-templates/invite";
import { renderTenantInvite } from "./email-templates/tenant-invite";
import { renderMention } from "./email-templates/mention";
import { renderResolution } from "./email-templates/resolution";
import { renderStatusChanged } from "./email-templates/status-changed";
import { renderTicketCompleted } from "./email-templates/ticket-completed";
import { renderTicketTransferred } from "./email-templates/ticket-transferred";
import { renderSignatureHtml, renderSignatureText } from "./email-templates/signature";
import { normalizeSignaturePrefs } from "./signature-prefs";
import { formatMessageIdHeader, normalizeMessageId } from "./inbound-email";
import { prisma } from "./db";
import { isAuthEmailConfigured, isOutboundEmailDevMode, sendAuthEmail, sendOutboundEmail } from "./email-transport";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * Sends through the dev-mode-aware transport (Mailpit in dev, Resend in prod)
 * while presenting Resend's `{ data, error }` result shape, so every existing
 * call site — and `logIfRejected` — keeps working unchanged. This is the single
 * point through which all business email now flows.
 */
async function sendProviderEmail(message: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: { content: string | Buffer; filename: string }[];
}): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const result = await sendOutboundEmail(message);
  if (result.ok) return { data: result.id ? { id: result.id } : null, error: null };
  return { data: null, error: { message: result.error } };
}

/** Threading id (RFC Message-ID) + Resend send id (bounce/delivery webhooks). */
export type SentEmailIds = {
  providerMessageId: string | null;
  providerEmailId: string | null;
};

/** Resend returns 200 with an `error` field on rejection (bad domain, invalid recipient, etc.) — it
 * does not throw. Without checking this, a rejected send looks identical to a successful one. */
function logIfRejected(kind: string, result: { data: { id: string } | null; error: { message: string } | null }) {
  if (result.error) {
    console.error(`[email] ${kind} rejected by Resend:`, result.error.message);
  }
  return result;
}

/**
 * After a successful send, prefer the RFC `message_id` (for In-Reply-To matching)
 * and keep the Resend `email_id` for delivery webhooks. Falls back to the email
 * id alone when retrieve is unavailable.
 */
async function resolveSentMessageIds(emailId: string | null | undefined): Promise<SentEmailIds> {
  if (!emailId) return { providerMessageId: null, providerEmailId: null };
  // In dev the send went to Mailpit, so `emailId` isn't a Resend id — don't hit
  // the real Resend API to resolve an RFC message-id; use the id we have.
  if (!resend || (await isOutboundEmailDevMode())) {
    return { providerMessageId: normalizeMessageId(emailId) || null, providerEmailId: emailId };
  }
  let rfc: string | null = null;
  try {
    const { data } = await resend.emails.get(emailId);
    if (data && typeof (data as { message_id?: unknown }).message_id === "string") {
      rfc = (data as { message_id: string }).message_id;
    }
  } catch (err) {
    console.warn("[email] failed to retrieve message_id for", emailId, err);
  }
  return {
    providerMessageId: normalizeMessageId(rfc ?? emailId) || null,
    providerEmailId: emailId,
  };
}

async function isEmailPrefEnabled(userId: string, prefKey: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });
  const prefs = profile?.notificationPrefs;
  if (typeof prefs !== "object" || prefs === null || Array.isArray(prefs)) return true;
  const stored = prefs as Record<string, unknown>;
  return typeof stored[prefKey] === "boolean" ? stored[prefKey] : true;
}

/** The acting user's rendered signature card, or null if they haven't set one up. */
export async function getUserSignature(
  userId: string | undefined | null,
): Promise<{ html: string; text: string } | null> {
  if (!userId) return null;
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  if (!profile) return null;
  const { enabled, activeId, list } = normalizeSignaturePrefs(profile.preferences);
  if (!enabled) return null;
  const active = list.find((entry) => entry.id === activeId) ?? list[0];
  if (!active) return null;
  return {
    html: renderSignatureHtml(active.html),
    text: renderSignatureText(active.html),
  };
}

export async function sendAssignmentEmail(args: {
  to: string;
  assigneeName: string;
  assigneeId: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  assignedByName: string;
  assignedById?: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyAssignment) return;
  if (!await isEmailPrefEnabled(args.assigneeId, "emailOnAssign")) return;

  const { to, assigneeId, assignedById, departmentId, subDepartmentId, ...rest } = args;
  const signature = config.hideSignature ? null : await getUserSignature(assignedById);
  const overrides = await getEmailTemplateOverrides(departmentId, subDepartmentId);
  const { subject, html, text } = renderAssignment({
    ...rest,
    signature,
    branding: brandingFrom(config),
    override: overrides.assignment,
  });
  logIfRejected(
    "assignment",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendIntakeConfirmationEmail(args: {
  to: string;
  submitterName: string;
  formName: string;
  submitterEmail?: string;
  title?: string;
  priority?: string;
  humanId?: string;
  responses?: { label: string; value: string }[];
  replyToken?: string | null;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<{ providerMessageId: string | null; providerEmailId: string | null; bodyText: string }> {
  if (!resend) return { providerMessageId: null, providerEmailId: null, bodyText: "" };
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyIntakeConfirmation) return { providerMessageId: null, providerEmailId: null, bodyText: "" };
  const overrides = await getEmailTemplateOverrides(args.departmentId, args.subDepartmentId);
  const { subject, html, text } = renderIntakeConfirmation({
    submitterName: args.submitterName,
    submitterEmail: args.submitterEmail,
    formName: args.formName,
    title: args.title,
    humanId: args.humanId,
    responses: args.responses,
    branding: brandingFrom(config),
    override: overrides.intakeConfirmation,
  });
  const { data } = logIfRejected(
    "intake confirmation",
    await sendProviderEmail({
      from: fromHeader(config),
      to: args.to,
      subject,
      html,
      text,
      replyTo: args.replyToken
        ? buildReplyToAddress(args.replyToken)
        : (config.replyTo || undefined),
    }),
  );
  const ids = await resolveSentMessageIds(data?.id ?? null);
  return { ...ids, bodyText: text };
}

/** Double opt-in verification email. `skipped` = sending is unavailable (no provider or the dept
 * disabled intake confirmations) so the caller should fall back to creating the ticket directly;
 * `ok` = the provider accepted the send (a false `ok` means it was rejected and no ticket should
 * be created). */
export async function sendIntakeVerificationEmail(args: {
  to: string;
  submitterName: string;
  formName: string;
  verifyUrl: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<{ ok: boolean; skipped: boolean }> {
  if (!resend) return { ok: false, skipped: true };
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyIntakeConfirmation) return { ok: false, skipped: true };
  const { subject, html, text } = renderIntakeVerification({
    submitterName: args.submitterName,
    formName: args.formName,
    verifyUrl: args.verifyUrl,
    branding: brandingFrom(config),
  });
  const { error } = logIfRejected(
    "intake verification",
    await sendProviderEmail({
      from: fromHeader(config),
      to: args.to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
  return { ok: !error, skipped: false };
}

export async function sendIntakeManagerAlertEmail(args: {
  to: string;
  managerId: string;
  managerName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  formName: string;
  submitterName: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!await isEmailPrefEnabled(args.managerId, "emailOnIntakeManagerAlert")) return;

  const { to, managerId, departmentId, subDepartmentId, ...rest } = args;
  const { subject, html, text } = renderIntakeManagerAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  logIfRejected(
    "intake manager alert",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendAssignmentFailedAlertEmail(args: {
  to: string;
  managerId: string;
  managerName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyAssignmentFailed) return;
  if (!await isEmailPrefEnabled(args.managerId, "emailOnAssignmentFailed")) return;

  const { to, managerId, departmentId, subDepartmentId, ...rest } = args;
  const { subject, html, text } = renderAssignmentFailedAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  logIfRejected(
    "assignment failed alert",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendMailboxConnectionFailedAlertEmail(args: {
  to: string;
  managerName: string;
  address: string;
  error: string;
}) {
  if (!resend) return;
  const config = await getEmailConfig(null);

  const { to, ...rest } = args;
  const { subject, html, text } = renderMailboxConnectionFailedAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  logIfRejected(
    "mailbox connection failed alert",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendResolutionEmail(args: {
  to: string;
  submitterName: string;
  formName: string;
  ticketTitle: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyResolution) return;
  const { to, departmentId, subDepartmentId, ...rest } = args;
  const overrides = await getEmailTemplateOverrides(departmentId, subDepartmentId);
  const { subject, html, text } = renderResolution({
    ...rest,
    branding: brandingFrom(config),
    override: overrides.resolution,
  });
  logIfRejected(
    "resolution",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendStatusChangedEmail(args: {
  to: string;
  submitterName: string;
  formName: string;
  ticketTitle: string;
  previousStatus: string;
  newStatus: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyStatusChanged) return;
  const { to, departmentId, subDepartmentId, ...rest } = args;
  const overrides = await getEmailTemplateOverrides(departmentId, subDepartmentId);
  const { subject, html, text } = renderStatusChanged({
    ...rest,
    branding: brandingFrom(config),
    override: overrides.statusChanged,
  });
  logIfRejected(
    "status changed",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendTicketCompletedEmail(args: {
  to: string;
  recipientId: string;
  recipientName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  completedByName: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyTicketCompleted) return;
  if (!await isEmailPrefEnabled(args.recipientId, "emailOnTicketComplete")) return;

  const { to, recipientId, departmentId, subDepartmentId, ...rest } = args;
  const overrides = await getEmailTemplateOverrides(departmentId, subDepartmentId);
  const { subject, html, text } = renderTicketCompleted({
    ...rest,
    branding: brandingFrom(config),
    override: overrides.ticketCompleted,
  });
  logIfRejected(
    "ticket completed",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendTicketTransferredEmail(args: {
  to: string;
  recipientId: string;
  recipientName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  fromSubDepartmentName: string;
  toSubDepartmentName: string;
  transferredByName: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyTicketTransferred) return;
  if (!await isEmailPrefEnabled(args.recipientId, "emailOnTicketTransfer")) return;

  const { to, recipientId, departmentId, subDepartmentId, ...rest } = args;
  const { subject, html, text } = renderTicketTransferred({
    ...rest,
    branding: brandingFrom(config),
  });
  logIfRejected(
    "ticket transferred",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

/**
 * Send a staff reply to an intake submitter. Sent from the agent's display name
 * over the shared support address, with a token `Reply-To` so the customer's
 * reply routes back to the ticket. Returns the provider message id (for
 * threading + inbound header-fallback matching), or null when unsent.
 */
export async function sendCustomerReplyEmail(args: {
  to: string;
  submitterName: string;
  agentName: string;
  agentId?: string;
  humanId: string;
  ticketTitle: string;
  messageText: string;
  replyToken?: string | null;
  inReplyTo?: string | null;
  attachments?: Array<{ content: Buffer; filename: string }>;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<SentEmailIds> {
  if (!resend) return { providerMessageId: null, providerEmailId: null };
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyCustomerReply) return { providerMessageId: null, providerEmailId: null };
  const signature = config.hideSignature ? null : await getUserSignature(args.agentId);
  const overrides = await getEmailTemplateOverrides(args.departmentId, args.subDepartmentId);

  const { html, text } = renderCustomerReply({
    submitterName: args.submitterName,
    ticketTitle: args.ticketTitle,
    agentName: args.agentName,
    messageText: args.messageText,
    signature,
    branding: brandingFrom(config),
    override: overrides.customerReply,
  });

  const from = `${args.agentName} (${config.fromName}) <${config.fromEmail}>`;
  const subject = `Re: [${args.humanId}] ${args.ticketTitle}`;
  const inReplyToHeader = formatMessageIdHeader(args.inReplyTo);
  const headers = inReplyToHeader
    ? { "In-Reply-To": inReplyToHeader, References: inReplyToHeader }
    : undefined;

  const { data } = logIfRejected(
    "customer reply",
    await sendProviderEmail({
      from,
      to: args.to,
      subject,
      html,
      text,
      replyTo: args.replyToken
        ? buildReplyToAddress(args.replyToken)
        : (config.replyTo || undefined),
      headers,
      attachments: args.attachments?.map((a) => ({ content: a.content, filename: a.filename })),
    }),
  );
  return resolveSentMessageIds(data?.id ?? null);
}

export async function sendInviteEmail(args: {
  to: string;
  inviterName: string;
  inviterId: string;
  departmentId: string;
  departmentName: string;
  subDepartmentName: string;
  role: string;
  message?: string | null;
  inviteToken: string;
  expiresAt: Date;
  isReminder?: boolean;
}) {
  if (!(await isAuthEmailConfigured())) {
    throw new Error("Authentication email is not configured");
  }
  const config = await getEmailConfig(args.departmentId);
  const signature = config.hideSignature ? null : await getUserSignature(args.inviterId);
  const overrides = await getEmailTemplateOverrides(args.departmentId);
  const { subject, html, text } = renderInvite({
    inviteeEmail: args.to,
    inviterName: args.inviterName,
    departmentName: args.departmentName,
    subDepartmentName: args.subDepartmentName,
    role: args.role,
    message: args.message,
    inviteToken: args.inviteToken,
    expiresAt: args.expiresAt,
    isReminder: args.isReminder,
    signature,
    branding: brandingFrom(config),
    override: overrides.invite,
  });
  const result = await sendAuthEmail({
    from: fromHeader(config),
    to: args.to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
  if (!result.ok) {
    console.error("[email] invite rejected:", result.error);
    throw new Error(result.error);
  }
  return result;
}

/**
 * Tenant-level invitation (join an organization). Unlike sendInviteEmail there's
 * no per-department email identity to key off when the invite is tenant-wide
 * (e.g. an admin invite carries no department), so email config falls back to the
 * tenant/global sender via getEmailConfig(departmentId?). Reused for both the
 * initial send and the 24h reminder (isReminder).
 */
export async function sendTenantInviteEmail(args: {
  to: string;
  inviterName: string;
  inviterId: string;
  tenantId: string;
  tenantName: string;
  role: string;
  departmentId?: string | null;
  message?: string | null;
  inviteToken: string;
  expiresAt: Date;
  isReminder?: boolean;
}) {
  if (!(await isAuthEmailConfigured())) {
    throw new Error("Authentication email is not configured");
  }
  const config = await getEmailConfig(args.departmentId ?? undefined);
  const signature = config.hideSignature ? null : await getUserSignature(args.inviterId);
  const { subject, html, text } = renderTenantInvite({
    inviteeEmail: args.to,
    inviterName: args.inviterName,
    tenantName: args.tenantName,
    role: args.role,
    message: args.message,
    inviteToken: args.inviteToken,
    expiresAt: args.expiresAt,
    isReminder: args.isReminder,
    signature,
    branding: brandingFrom(config),
  });
  const result = await sendAuthEmail({
    from: fromHeader(config),
    to: args.to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
  if (!result.ok) {
    console.error("[email] tenant invite rejected:", result.error);
    throw new Error(result.error);
  }
  return result;
}

export async function sendMentionEmail(args: {
  to: string;
  mentionedName: string;
  mentionedUserId: string;
  ticketId: string;
  ticketTitle: string;
  actorId?: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyMention) return;
  if (!await isEmailPrefEnabled(args.mentionedUserId, "emailOnMention")) return;

  const { to, mentionedUserId, actorId, departmentId, subDepartmentId, ...rest } = args;
  const signature = config.hideSignature ? null : await getUserSignature(actorId);
  const overrides = await getEmailTemplateOverrides(departmentId, subDepartmentId);
  const { subject, html, text } = renderMention({
    ...rest,
    signature,
    branding: brandingFrom(config),
    override: overrides.mention,
  });
  logIfRejected(
    "mention",
    await sendProviderEmail({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}
