import {
  BASE_URL,
  type Branding,
  button,
  escapeHtml,
  ensureAbsoluteUrl,
  layout,
  signatureBlock,
  summaryTable,
} from "./_shared";
import { formatInviteExpiry } from "../invites/constants";

const roleLabel = (role: string) =>
  role === "sub_manager"
    ? "Sub-manager"
    : role === "admin"
      ? "Admin"
      : role.charAt(0).toUpperCase() + role.slice(1);

/**
 * Tenant-level invitation email (join an organization/tenant), distinct from the
 * department invite. Accept link resolves to `/tenant-invite/<token>`. Supports a
 * reminder variant fired ~12h before nothing has happened; both variants state
 * the 24h (1-day) validity window and its exact expiry time.
 */
export function renderTenantInvite({
  inviteeEmail,
  inviterName,
  tenantName,
  role,
  message,
  inviteToken,
  expiresAt,
  isReminder = false,
  signature,
  branding,
}: {
  inviteeEmail: string;
  inviterName: string;
  tenantName: string;
  role: string;
  message?: string | null;
  inviteToken: string;
  expiresAt: Date;
  isReminder?: boolean;
  signature?: { html: string; text: string } | null;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const inviter = escapeHtml(inviterName);
  const tenant = escapeHtml(tenantName);
  const roleText = escapeHtml(roleLabel(role));
  const email = escapeHtml(inviteeEmail);
  const url = ensureAbsoluteUrl(`${BASE_URL}/tenant-invite/${inviteToken}`);
  const expiryText = formatInviteExpiry(expiresAt);
  const sig = signatureBlock(signature);

  const messageText = (message ?? "").trim();
  const messageHtml = messageText
    ? `<div style="margin:0 0 24px 0;padding:14px 16px;background:#f8fafc;border-left:3px solid #0a76b9;border-radius:4px;color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(messageText)}</div>`
    : "";

  const infoHtml = summaryTable([
    { label: "Organization", value: tenantName },
    { label: "Role", value: roleLabel(role) },
  ]);

  const heading = isReminder
    ? "Your invitation is still waiting"
    : "You're invited to join an organization";
  const intro = isReminder
    ? `<p style="margin:0 0 24px 0;">Just a reminder — <strong>${inviter}</strong> invited you to join <strong>${tenant}</strong> on Support Ticketing System as <strong>${roleText}</strong>, and your invitation hasn't been accepted yet.</p>`
    : `<p style="margin:0 0 24px 0;"><strong>${inviter}</strong> has invited you to join <strong>${tenant}</strong> on Support Ticketing System as <strong>${roleText}</strong>.</p>`;

  const body = `
    <p style="margin:0 0 16px 0;">Hello,</p>
    ${intro}
    ${messageHtml}
    ${infoHtml}
    ${button({ href: url, label: "Go to Accept Invitation page", branding })}
    <p style="margin:16px 0 0 0;color:#6b7280;font-size:13px;">This invitation is valid for 1 day and expires on <strong>${escapeHtml(expiryText)}</strong>. After that the link stops working and a new invitation is required.</p>
    <p style="margin:8px 0 0 0;color:#6b7280;font-size:13px;">This invitation was sent to ${email}. Sign in with your Microsoft work account to accept.</p>
    ${sig.html}
  `;

  const textParts = [
    "Hello,",
    "",
    isReminder
      ? `Just a reminder — ${inviterName} invited you to join ${tenantName} on Support Ticketing System as ${roleLabel(role)}, and your invitation hasn't been accepted yet.`
      : `${inviterName} has invited you to join ${tenantName} on Support Ticketing System as ${roleLabel(role)}.`,
  ];
  if (messageText) textParts.push("", messageText);
  textParts.push(
    "",
    `Organization: ${tenantName}`,
    `Role: ${roleLabel(role)}`,
    "",
    `Go to Accept Invitation page: ${url}`,
    "",
    `This invitation is valid for 1 day and expires on ${expiryText}. After that the link stops working and a new invitation is required.`,
    "",
    `This invitation was sent to ${inviteeEmail}. Sign in with your Microsoft work account to accept.`,
    "",
    sig.text,
  );

  return {
    subject: isReminder
      ? `Reminder: your invitation to join ${tenantName} expires soon`
      : `${inviterName} invited you to join ${tenantName}`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: isReminder
        ? `Your invitation to ${tenantName} expires ${expiryText}`
        : `${inviterName} invited you to ${tenantName}`,
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    }),
    text: textParts.join("\n"),
  };
}
