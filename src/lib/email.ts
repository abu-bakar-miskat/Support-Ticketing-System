import { Resend } from "resend";
import { brandingFrom, fromHeader, getEmailConfig, getEmailTemplateOverrides } from "./email-config";
import { renderCustomerReply } from "./email-templates/customer-reply";
import { renderAssignment } from "./email-templates/assignment";
import { renderIntakeConfirmation } from "./email-templates/intake-confirmation";
import { renderIntakeVerification } from "./email-templates/intake-verification";
import { renderIntakeManagerAlert } from "./email-templates/intake-manager-alert";
import { renderAssignmentFailedAlert } from "./email-templates/assignment-failed-alert";
import { renderMailboxConnectionFailedAlert } from "./email-templates/mailbox-connection-failed-alert";
import { renderInvite } from "./email-templates/invite";
import { renderTenantInvite } from "./email-templates/tenant-invite";
import { renderSuperAdminInvite } from "./email-templates/super-admin-invite";
import { renderMention } from "./email-templates/mention";
import { renderResolution } from "./email-templates/resolution";
import { renderStatusChanged } from "./email-templates/status-changed";
import { renderTicketCompleted } from "./email-templates/ticket-completed";
import { renderTicketTransferred } from "./email-templates/ticket-transferred";
import { renderTestEmail } from "./email-templates/test-email";
import { renderSignatureHtml, renderSignatureText } from "./email-templates/signature";
import { normalizeSignaturePrefs } from "./signature-prefs";
import { formatMessageIdHeader, normalizeMessageId } from "./inbound-email";
import { prisma } from "./db";
import { isAuthEmailConfigured, isOutboundEmailDevMode, sendAuthEmail, sendOutboundEmail, type OutboundEmail } from "./email-transport";
import { resolveSenderMailbox, sendViaReplyMailbox, type MailScope } from "./mailbox-outbound";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Threading id (RFC Message-ID) + Resend send id (bounce/delivery webhooks). */
export type SentEmailIds = {
  providerMessageId: string | null;
  providerEmailId: string | null;
};

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

export type EmailDelivery = "mailbox" | "mailpit" | "resend";

/** Pulls the tenant / department / sub-department ids off any email args object. */
function scopeOf(args: { tenantId?: string | null; departmentId?: string | null; subDepartmentId?: string | null }): MailScope {
  return { tenantId: args.tenantId, departmentId: args.departmentId, subDepartmentId: args.subDepartmentId };
}

/**
 * The single chokepoint for tenant email (customers, staff, invitees). Sends
 * as the most specific connected Microsoft 365 mailbox — sub-department →
 * department → tenant — with Reply-To that same address. Only when none is
 * connected does it fall back to the platform sender (Resend, or Mailpit in
 * dev mode); `sent: false` when that isn't configured either.
 *
 * `throwOnMailboxError`: when the caller must surface a failure (an agent's
 * reply, an invite) rather than log it.
 */
async function sendScoped(
  kind: string,
  scope: MailScope,
  message: OutboundEmail,
  { throwOnMailboxError = false }: { throwOnMailboxError?: boolean } = {},
): Promise<{ sent: boolean; ids: SentEmailIds; fromEmail: string | null; via: EmailDelivery | null; error?: string }> {
  const none = { providerMessageId: null, providerEmailId: null };
  const mailbox = await resolveSenderMailbox(scope);
  if (mailbox) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Reply-To is always the mailbox
    const { replyTo, ...rest } = message;
    const result = await sendViaReplyMailbox(mailbox, rest);
    if (!result.ok) {
      console.error(`[email] ${kind} via mailbox ${mailbox.address} failed:`, result.error);
      if (throwOnMailboxError) throw new Error(result.error);
      return { sent: false, ids: none, fromEmail: null, via: null, error: result.error };
    }
    return {
      sent: true,
      ids: { providerMessageId: normalizeMessageId(result.messageId) || null, providerEmailId: null },
      fromEmail: result.fromEmail,
      via: "mailbox",
    };
  }

  const result = await sendOutboundEmail(message);
  if (!result.ok) {
    console.error(`[email] ${kind} rejected:`, result.error);
    return { sent: false, ids: none, fromEmail: null, via: null, error: result.error };
  }
  return {
    sent: true,
    ids: await resolveSentMessageIds(result.id),
    fromEmail: parseAddress(message.from),
    via: result.via,
  };
}

function parseAddress(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
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
  await sendScoped("assignment", scopeOf(args), {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
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
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<{ providerMessageId: string | null; providerEmailId: string | null; bodyText: string }> {
  // Always sent — departments cannot opt out of confirming receipt to submitters.
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
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
  const { ids } = await sendScoped("intake confirmation", scopeOf(args), {
    from: fromHeader(config),
    to: args.to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
  return { ...ids, bodyText: text };
}

/** Double opt-in verification email. Mandatory for unverified submitters — there is no
 * department opt-out and no fallback to creating the ticket unverified. `ok: false` means no
 * ticket may be created: `reason: "unavailable"` = no email provider is configured,
 * `reason: "rejected"` = the provider refused the send (usually a bad recipient). */
export async function sendIntakeVerificationEmail(args: {
  to: string;
  submitterName: string;
  formName: string;
  verifyUrl: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "unavailable" | "rejected" }> {
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  const { subject, html, text } = renderIntakeVerification({
    submitterName: args.submitterName,
    formName: args.formName,
    verifyUrl: args.verifyUrl,
    branding: brandingFrom(config),
  });
  const hasMailbox = !!(await resolveSenderMailbox(scopeOf(args)));
  if (!hasMailbox && !(await isAuthEmailConfigured())) return { ok: false, reason: "unavailable" };
  const { sent } = await sendScoped("intake verification", scopeOf(args), {
    from: fromHeader(config),
    to: args.to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
  return sent ? { ok: true } : { ok: false, reason: "rejected" };
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
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!await isEmailPrefEnabled(args.managerId, "emailOnIntakeManagerAlert")) return;

  const { to, managerId, departmentId, subDepartmentId, ...rest } = args;
  const { subject, html, text } = renderIntakeManagerAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  await sendScoped("intake manager alert", scopeOf(args), {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
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
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyAssignmentFailed) return;
  if (!await isEmailPrefEnabled(args.managerId, "emailOnAssignmentFailed")) return;

  const { to, managerId, departmentId, subDepartmentId, ...rest } = args;
  const { subject, html, text } = renderAssignmentFailedAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  await sendScoped("assignment failed alert", scopeOf(args), {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
}

export async function sendMailboxConnectionFailedAlertEmail(args: {
  to: string;
  managerName: string;
  address: string;
  error: string;
  tenantId?: string | null;
  departmentId?: string | null;
}) {
  const config = await getEmailConfig(args.departmentId ?? null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- scope ids aren't template fields
  const { to, tenantId, departmentId, ...rest } = args;
  const { subject, html, text } = renderMailboxConnectionFailedAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  await sendScoped("mailbox connection failed alert", scopeOf(args), {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
}

export async function sendResolutionEmail(args: {
  to: string;
  submitterName: string;
  formName: string;
  ticketTitle: string;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}) {
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyResolution) return;
  const { to, departmentId, subDepartmentId, ...rest } = args;
  const overrides = await getEmailTemplateOverrides(departmentId, subDepartmentId);
  const { subject, html, text } = renderResolution({
    ...rest,
    branding: brandingFrom(config),
    override: overrides.resolution,
  });
  await sendScoped("resolution", { departmentId, subDepartmentId }, {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
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
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyStatusChanged) return;
  const { to, departmentId, subDepartmentId, ...rest } = args;
  const overrides = await getEmailTemplateOverrides(departmentId, subDepartmentId);
  const { subject, html, text } = renderStatusChanged({
    ...rest,
    branding: brandingFrom(config),
    override: overrides.statusChanged,
  });
  await sendScoped("status changed", { departmentId, subDepartmentId }, {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
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
  await sendScoped("ticket completed", scopeOf(args), {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
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
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyTicketTransferred) return;
  if (!await isEmailPrefEnabled(args.recipientId, "emailOnTicketTransfer")) return;

  const { to, recipientId, departmentId, subDepartmentId, ...rest } = args;
  const { subject, html, text } = renderTicketTransferred({
    ...rest,
    branding: brandingFrom(config),
  });
  await sendScoped("ticket transferred", scopeOf(args), {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
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
  inReplyTo?: string | null;
  attachments?: Array<{ content: Buffer; filename: string }>;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<SentEmailIds & { fromEmail?: string | null }> {
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  if (!config.notifyCustomerReply) return { providerMessageId: null, providerEmailId: null, fromEmail: null };
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

  const { ids, fromEmail, sent, error } = await sendScoped(
    "customer reply",
    scopeOf(args),
    {
      from,
      to: args.to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
      headers,
      attachments: args.attachments?.map((a) => ({ content: a.content, filename: a.filename })),
    },
    { throwOnMailboxError: true },
  );
  if (!sent) throw new Error(error ?? "Email is not configured");
  return { ...ids, fromEmail };
}

/**
 * Invites go out from the tenant's (or the inviting department's) mailbox like
 * any other tenant email; a failure throws so the caller can report it.
 */
async function sendInviteScoped(
  kind: string,
  scope: MailScope,
  message: OutboundEmail,
): Promise<{ ok: true; id: string | null; via: EmailDelivery }> {
  const result = await sendScoped(kind, scope, message, { throwOnMailboxError: true });
  if (!result.sent || !result.via) throw new Error(result.error ?? "Email is not configured");
  return { ok: true, id: result.ids.providerMessageId, via: result.via };
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
  return sendInviteScoped("invite", scopeOf(args), {
    from: fromHeader(config),
    to: args.to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
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
  return sendInviteScoped("tenant invite", scopeOf(args), {
    from: fromHeader(config),
    to: args.to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
}

/** Platform super-admin invitation. No account exists until the link is accepted. */
export async function sendSuperAdminInviteEmail(args: {
  to: string;
  inviterName: string;
  inviterId: string;
  inviteToken: string;
  expiresAt: Date;
}) {
  if (!(await isAuthEmailConfigured())) {
    throw new Error("Authentication email is not configured");
  }
  const config = await getEmailConfig();
  const signature = config.hideSignature ? null : await getUserSignature(args.inviterId);
  const { subject, html, text } = renderSuperAdminInvite({
    inviteeEmail: args.to,
    inviterName: args.inviterName,
    inviteToken: args.inviteToken,
    expiresAt: args.expiresAt,
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
    console.error("[email] super-admin invite rejected:", result.error);
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
  await sendScoped("mention", scopeOf(args), {
    from: fromHeader(config),
    to,
    subject,
    html,
    text,
    replyTo: config.replyTo || undefined,
  });
}

/**
 * "Send a test email" on the email settings page: goes through exactly the
 * mailbox a real email for this scope would use, and reports which one.
 */
export async function sendTestEmail(args: {
  to: string;
  recipientName: string;
  tenantId?: string | null;
  departmentId?: string | null;
  subDepartmentId?: string | null;
}): Promise<{ ok: true; from: string | null; via: EmailDelivery } | { ok: false; error: string }> {
  const config = await getEmailConfig(args.departmentId, args.subDepartmentId);
  const branding = brandingFrom(config);
  const brandName = branding.headerTitle?.trim() || "Global Support Portal";
  const { subject, html, text } = renderTestEmail({ recipientName: args.recipientName, brandName, branding });
  try {
    const result = await sendScoped("test email", scopeOf(args), {
      from: fromHeader(config),
      to: args.to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }, { throwOnMailboxError: true });
    if (!result.sent || !result.via) return { ok: false, error: result.error ?? "Email is not configured" };
    return { ok: true, from: result.fromEmail, via: result.via };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to send test email" };
  }
}

/** Which address email for this scope goes out from: a connected mailbox, or the platform sender. */
export async function describeSender(scope: MailScope): Promise<{ address: string; platform: boolean }> {
  const mailbox = await resolveSenderMailbox(scope);
  if (mailbox) return { address: mailbox.address, platform: false };
  const config = await getEmailConfig(scope.departmentId, scope.subDepartmentId);
  return { address: config.fromEmail, platform: true };
}

