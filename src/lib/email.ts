import { Resend } from "resend";
import { brandingFrom, fromHeader, getEmailConfig, getEmailTemplateOverrides } from "./email-config";
import { buildReplyToAddress } from "./customer-conversation";
import { renderCustomerReply } from "./email-templates/customer-reply";
import { renderAssignment } from "./email-templates/assignment";
import { renderIntakeConfirmation } from "./email-templates/intake-confirmation";
import { renderIntakeVerification } from "./email-templates/intake-verification";
import { renderIntakeManagerAlert } from "./email-templates/intake-manager-alert";
import { renderAssignmentFailedAlert } from "./email-templates/assignment-failed-alert";
import { renderInvite } from "./email-templates/invite";
import { renderMention } from "./email-templates/mention";
import { renderResolution } from "./email-templates/resolution";
import { renderTicketCompleted } from "./email-templates/ticket-completed";
import { renderSignatureHtml, renderSignatureText } from "./email-templates/signature";
import { normalizeSignaturePrefs } from "./signature-prefs";
import { prisma } from "./db";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Resend returns 200 with an `error` field on rejection (bad domain, invalid recipient, etc.) — it
 * does not throw. Without checking this, a rejected send looks identical to a successful one. */
function logIfRejected(kind: string, result: { data: { id: string } | null; error: { message: string } | null }) {
  if (result.error) {
    console.error(`[email] ${kind} rejected by Resend:`, result.error.message);
  }
  return result;
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
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyAssignment) return;
  if (!await isEmailPrefEnabled(args.assigneeId, "emailOnAssign")) return;

  const { to, assigneeId, assignedById, departmentId, ...rest } = args;
  const signature = await getUserSignature(assignedById);
  const overrides = await getEmailTemplateOverrides(departmentId);
  const { subject, html, text } = renderAssignment({
    ...rest,
    signature,
    branding: brandingFrom(config),
    override: overrides.assignment,
  });
  logIfRejected(
    "assignment",
    await resend.emails.send({
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
}): Promise<{ providerMessageId: string | null; bodyText: string }> {
  if (!resend) return { providerMessageId: null, bodyText: "" };
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyIntakeConfirmation) return { providerMessageId: null, bodyText: "" };
  const overrides = await getEmailTemplateOverrides(args.departmentId);
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
    await resend.emails.send({
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
  return { providerMessageId: data?.id ?? null, bodyText: text };
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
}): Promise<{ ok: boolean; skipped: boolean }> {
  if (!resend) return { ok: false, skipped: true };
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyIntakeConfirmation) return { ok: false, skipped: true };
  const { subject, html, text } = renderIntakeVerification({
    submitterName: args.submitterName,
    formName: args.formName,
    verifyUrl: args.verifyUrl,
    branding: brandingFrom(config),
  });
  const { error } = logIfRejected(
    "intake verification",
    await resend.emails.send({
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
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId);
  if (!await isEmailPrefEnabled(args.managerId, "emailOnIntakeManagerAlert")) return;

  const { to, managerId, departmentId, ...rest } = args;
  const { subject, html, text } = renderIntakeManagerAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  logIfRejected(
    "intake manager alert",
    await resend.emails.send({
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
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyAssignmentFailed) return;
  if (!await isEmailPrefEnabled(args.managerId, "emailOnAssignmentFailed")) return;

  const { to, managerId, departmentId, ...rest } = args;
  const { subject, html, text } = renderAssignmentFailedAlert({
    ...rest,
    branding: brandingFrom(config),
  });
  logIfRejected(
    "assignment failed alert",
    await resend.emails.send({
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
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyResolution) return;
  const { to, departmentId, ...rest } = args;
  const overrides = await getEmailTemplateOverrides(departmentId);
  const { subject, html, text } = renderResolution({
    ...rest,
    branding: brandingFrom(config),
    override: overrides.resolution,
  });
  logIfRejected(
    "resolution",
    await resend.emails.send({
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
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyTicketCompleted) return;
  if (!await isEmailPrefEnabled(args.recipientId, "emailOnTicketComplete")) return;

  const { to, recipientId, departmentId, ...rest } = args;
  const overrides = await getEmailTemplateOverrides(departmentId);
  const { subject, html, text } = renderTicketCompleted({
    ...rest,
    branding: brandingFrom(config),
    override: overrides.ticketCompleted,
  });
  logIfRejected(
    "ticket completed",
    await resend.emails.send({
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
}): Promise<string | null> {
  if (!resend) return null;
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyCustomerReply) return null;
  const signature = await getUserSignature(args.agentId);
  const overrides = await getEmailTemplateOverrides(args.departmentId);

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
  const headers = args.inReplyTo
    ? { "In-Reply-To": args.inReplyTo, References: args.inReplyTo }
    : undefined;

  const { data } = logIfRejected(
    "customer reply",
    await resend.emails.send({
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
  return data?.id ?? null;
}

export async function sendInviteEmail(args: {
  to: string;
  inviterName: string;
  inviterId: string;
  departmentId: string;
  departmentName: string;
  teamName: string;
  role: string;
  message?: string | null;
  inviteToken: string;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId);
  const signature = await getUserSignature(args.inviterId);
  const overrides = await getEmailTemplateOverrides(args.departmentId);
  const { subject, html, text } = renderInvite({
    inviteeEmail: args.to,
    inviterName: args.inviterName,
    departmentName: args.departmentName,
    teamName: args.teamName,
    role: args.role,
    message: args.message,
    inviteToken: args.inviteToken,
    signature,
    branding: brandingFrom(config),
    override: overrides.invite,
  });
  logIfRejected(
    "invite",
    await resend.emails.send({
      from: fromHeader(config),
      to: args.to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}

export async function sendMentionEmail(args: {
  to: string;
  mentionedName: string;
  mentionedUserId: string;
  ticketId: string;
  ticketTitle: string;
  actorId?: string;
  departmentId?: string | null;
}) {
  if (!resend) return;
  const config = await getEmailConfig(args.departmentId);
  if (!config.notifyMention) return;
  if (!await isEmailPrefEnabled(args.mentionedUserId, "emailOnMention")) return;

  const { to, mentionedUserId, actorId, departmentId, ...rest } = args;
  const signature = await getUserSignature(actorId);
  const overrides = await getEmailTemplateOverrides(departmentId);
  const { subject, html, text } = renderMention({
    ...rest,
    signature,
    branding: brandingFrom(config),
    override: overrides.mention,
  });
  logIfRejected(
    "mention",
    await resend.emails.send({
      from: fromHeader(config),
      to,
      subject,
      html,
      text,
      replyTo: config.replyTo || undefined,
    }),
  );
}
