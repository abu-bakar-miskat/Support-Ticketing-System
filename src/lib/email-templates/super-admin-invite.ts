import {
  BASE_URL,
  type Branding,
  button,
  escapeHtml,
  ensureAbsoluteUrl,
  layout,
  signatureBlock,
} from "./_shared";
import { formatInviteExpiry } from "../invites/constants";

/**
 * Platform super-admin invitation. Accept link resolves to
 * `/super-admin-invite/<token>`. The recipient has no account until they accept.
 */
export function renderSuperAdminInvite({
  inviteeEmail,
  inviterName,
  inviteToken,
  expiresAt,
  signature,
  branding,
}: {
  inviteeEmail: string;
  inviterName: string;
  inviteToken: string;
  expiresAt: Date;
  signature?: { html: string; text: string } | null;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const inviter = escapeHtml(inviterName);
  const email = escapeHtml(inviteeEmail);
  const url = ensureAbsoluteUrl(`${BASE_URL}/super-admin-invite/${inviteToken}`);
  const expiryText = formatInviteExpiry(expiresAt);
  const sig = signatureBlock(signature);

  const body = `
    <p style="margin:0 0 16px 0;">Hello,</p>
    <p style="margin:0 0 24px 0;"><strong>${inviter}</strong> has invited you to Global Support Portal as a <strong>Super Admin</strong>.</p>
    <p style="margin:0 0 24px 0;">Your account is created when you accept this invitation. Nothing is set up until then.</p>
    ${button({ href: url, label: "Go to Accept Invitation page", branding })}
    <p style="margin:16px 0 0 0;color:#6b7280;font-size:13px;">This invitation is valid for 1 day and expires on <strong>${escapeHtml(expiryText)}</strong>. After that the link stops working and a new invitation is required.</p>
    <p style="margin:8px 0 0 0;color:#6b7280;font-size:13px;">This invitation was sent to ${email}.</p>
    ${sig.html}
  `;

  const text = [
    "Hello,",
    "",
    `${inviterName} has invited you to Global Support Portal as a Super Admin.`,
    "",
    "Your account is created when you accept this invitation. Nothing is set up until then.",
    "",
    `Go to Accept Invitation page: ${url}`,
    "",
    `This invitation is valid for 1 day and expires on ${expiryText}. After that the link stops working and a new invitation is required.`,
    "",
    `This invitation was sent to ${inviteeEmail}.`,
    "",
    sig.text,
  ].join("\n");

  return {
    subject: `${inviterName} invited you as a Super Admin`,
    html: layout({
      heading: "You're invited as a Super Admin",
      bodyHtml: body,
      preheader: `${inviterName} invited you to Global Support Portal`,
      branding,
    }),
    text,
  };
}
