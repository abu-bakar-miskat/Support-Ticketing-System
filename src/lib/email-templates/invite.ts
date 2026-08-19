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
import type { EmailTemplateOverride } from "../email-config";

export const INVITE_PLACEHOLDER_KEYS = [
  "inviteeEmail",
  "inviterName",
  "inviterFirstName",
  "departmentName",
  "teamName",
  "role",
  "message",
  "messageBlock",
  "inviteUrl",
  "acceptInviteButton",
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
        signature: sig.html,
      },
      fallbackSubject: `${inviterName} invited you to join ${departmentName}`,
      fallbackHeading: "You're invited to join a department",
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    });
  }

  const infoRows = [
    { label: "Department", value: departmentName },
    { label: "Team", value: subDepartmentName },
    { label: "Role", value: role.charAt(0).toUpperCase() + role.slice(1) },
  ];
  const infoHtml = summaryTable(infoRows);

  const heading = "You're invited to join a department";
  const body = `
    <p style="margin:0 0 16px 0;">Hello,</p>
    <p style="margin:0 0 24px 0;"><strong>${inviter}</strong> has invited you to join <strong>${dept}</strong> on PEN Platform as <strong>${roleLabel}</strong> on the <strong>${subDepartment}</strong> sub department.</p>
    ${messageHtml}
    ${infoHtml}
    ${button({ href: url, label: "Accept invitation", branding })}
    <p style="margin:24px 0 0 0;color:#6b7280;font-size:13px;">This invitation was sent to ${email}. Sign in with your Microsoft work account to accept.</p>
    ${sig.html}
  `;

  const textParts = [
    `Hello,`,
    "",
    `${inviterName} has invited you to join ${departmentName} on PEN Platform as ${role} on the ${subDepartmentName} team.`,
  ];
  if (messageText) {
    textParts.push("", messageText);
  }
  textParts.push(
    "",
    `Department: ${departmentName}`,
    `Team: ${subDepartmentName}`,
    `Role: ${role}`,
    "",
    `Accept invitation: ${url}`,
    "",
    `This invitation was sent to ${inviteeEmail}. Sign in with your Microsoft work account to accept.`,
    "",
    sig.text,
  );

  return {
    subject: `${inviterName} invited you to join ${departmentName}`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `${inviterName} invited you to ${departmentName}`,
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    }),
    text: textParts.join("\n"),
  };
}
