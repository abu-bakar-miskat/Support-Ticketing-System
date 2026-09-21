import {
  BASE_URL,
  type Branding,
  button,
  escapeHtml,
  ensureAbsoluteUrl,
  firstName,
  layout,
  renderWithOverride,
  signatureBlock,
  summaryTable,
} from "./_shared";
import { formatInviteExpiry } from "../invites/constants";
import type { EmailTemplateOverride } from "../email-config";

export const INVITE_PLACEHOLDER_KEYS = [
  "inviteeEmail",
  "inviterName",
  "inviterFirstName",
  "departmentName",
  "subDepartmentName",
  "role",
  "message",
  "messageBlock",
  "inviteUrl",
  "acceptInviteButton",
  "expiresAt",
  "signature",
] as const;

export function renderInvite({
  inviteeEmail,
  inviterName,
  departmentName,
  subDepartmentName,
  role,
  message,
  inviteToken,
  expiresAt,
  isReminder = false,
  signature,
  branding,
  override,
}: {
  inviteeEmail: string;
  inviterName: string;
  departmentName: string;
  subDepartmentName: string;
  role: string;
  message?: string | null;
  inviteToken: string;
  expiresAt: Date;
  isReminder?: boolean;
  signature?: { html: string; text: string } | null;
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const inviter = escapeHtml(inviterName);
  const inviterFirst = escapeHtml(firstName(inviterName));
  const dept = escapeHtml(departmentName);
  const subDepartment = escapeHtml(subDepartmentName);
  const roleLabel = escapeHtml(
    role === "sub_manager"
      ? "Sub-manager"
      : role.charAt(0).toUpperCase() + role.slice(1),
  );
  const email = escapeHtml(inviteeEmail);
  const url = ensureAbsoluteUrl(`${BASE_URL}/invite/${inviteToken}`);
  const expiryText = formatInviteExpiry(expiresAt);
  const expiryLineHtml = `<p style="margin:16px 0 0 0;color:#6b7280;font-size:13px;">This invitation is valid for 1 day and expires on <strong>${escapeHtml(expiryText)}</strong>. After that the link stops working and a new invitation is required.</p>`;
  const sig = signatureBlock(signature);
  const messageText = (message ?? "").trim();
  const messageHtml = messageText
    ? `<div style="margin:0 0 24px 0;padding:14px 16px;background:#f8fafc;border-left:3px solid #0a76b9;border-radius:4px;color:#374151;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(messageText)}</div>`
    : "";
  const messageBlock = messageHtml;

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        inviteeEmail: email,
        inviterName: inviter,
        inviterFirstName: inviterFirst,
        departmentName: dept,
        subDepartmentName: subDepartment,
        role: roleLabel,
        message: escapeHtml(messageText),
        messageBlock,
        inviteUrl: url,
        acceptInviteButton: button({ href: url, label: "Accept invitation", branding }),
        expiresAt: escapeHtml(expiryText),
        signature: sig.html,
      },
      fallbackSubject: isReminder
        ? `Reminder: your invitation to join ${departmentName} expires soon`
        : `${inviterName} invited you to join ${departmentName}`,
      fallbackHeading: isReminder
        ? "Your invitation is still waiting"
        : "You're invited to join a department",
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    });
  }

  const infoRows = [
    { label: "Department", value: departmentName },
    { label: "SubDepartment", value: subDepartmentName },
    { label: "Role", value: role.charAt(0).toUpperCase() + role.slice(1) },
  ];
  const infoHtml = summaryTable(infoRows);

  const heading = isReminder
    ? "Your invitation is still waiting"
    : "You're invited to join a department";
  const intro = isReminder
    ? `<p style="margin:0 0 24px 0;">Just a reminder — <strong>${inviter}</strong> invited you to join <strong>${dept}</strong> on Support Ticketing System as <strong>${roleLabel}</strong> on the <strong>${subDepartment}</strong> sub department, and your invitation hasn't been accepted yet.</p>`
    : `<p style="margin:0 0 24px 0;"><strong>${inviter}</strong> has invited you to join <strong>${dept}</strong> on Support Ticketing System as <strong>${roleLabel}</strong> on the <strong>${subDepartment}</strong> sub department.</p>`;
  const body = `
    <p style="margin:0 0 16px 0;">Hello,</p>
    ${intro}
    ${messageHtml}
    ${infoHtml}
    ${button({ href: url, label: "Accept invitation", branding })}
    ${expiryLineHtml}
    <p style="margin:8px 0 0 0;color:#6b7280;font-size:13px;">This invitation was sent to ${email}. Sign in with your Microsoft work account to accept.</p>
    ${sig.html}
  `;

  const textParts = [
    `Hello,`,
    "",
    isReminder
      ? `Just a reminder — ${inviterName} invited you to join ${departmentName} on Support Ticketing System as ${role} on the ${subDepartmentName} subDepartment, and your invitation hasn't been accepted yet.`
      : `${inviterName} has invited you to join ${departmentName} on Support Ticketing System as ${role} on the ${subDepartmentName} subDepartment.`,
  ];
  if (messageText) {
    textParts.push("", messageText);
  }
  textParts.push(
    "",
    `Department: ${departmentName}`,
    `SubDepartment: ${subDepartmentName}`,
    `Role: ${role}`,
    "",
    `Accept invitation: ${url}`,
    "",
    `This invitation is valid for 1 day and expires on ${expiryText}. After that the link stops working and a new invitation is required.`,
    "",
    `This invitation was sent to ${inviteeEmail}. Sign in with your Microsoft work account to accept.`,
    "",
    sig.text,
  );

  return {
    subject: isReminder
      ? `Reminder: your invitation to join ${departmentName} expires soon`
      : `${inviterName} invited you to join ${departmentName}`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: isReminder
        ? `Your invitation to ${departmentName} expires ${expiryText}`
        : `${inviterName} invited you to ${departmentName}`,
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    }),
    text: textParts.join("\n"),
  };
}
