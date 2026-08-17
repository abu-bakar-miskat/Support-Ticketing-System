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

export const ASSIGNMENT_PLACEHOLDER_KEYS = [
  "assigneeName",
  "assigneeFirstName",
  "humanId",
  "ticketTitle",
  "assignedByName",
  "ticketUrl",
  "viewTicketButton",
  "signature",
] as const;

export function renderAssignment({
  assigneeName,
  ticketId,
  humanId,
  ticketTitle,
  assignedByName,
  signature,
  branding,
  override,
}: {
  assigneeName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  assignedByName: string;
  signature?: { html: string; text: string } | null;
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(assigneeName));
  const by = escapeHtml(assignedByName);
  const id = escapeHtml(humanId);
  const title = escapeHtml(ticketTitle);
  const url = ensureAbsoluteUrl(`${BASE_URL}/tickets/${ticketId}`);
  const sig = signatureBlock(signature);
  const defaultSubject = `${assignedByName} assigned ${humanId} to you`;

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        assigneeName: name,
        assigneeFirstName: escapeHtml(firstName(assigneeName)),
        humanId: id,
        ticketTitle: title,
        assignedByName: by,
        ticketUrl: url,
        viewTicketButton: button({ href: url, label: "View ticket", branding }),
        signature: sig.html,
      },
      fallbackSubject: defaultSubject,
      fallbackHeading: "A ticket was assigned to you",
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    });
  }

  const infoRows = [
    { label: "Ticket ID", value: humanId },
    { label: "Title", value: ticketTitle },
    { label: "Assigned by", value: assignedByName },
  ];
  const infoHtml = summaryTable(infoRows);

  const heading = "A ticket was assigned to you";
  const body = `
    <p style="margin:0 0 16px 0;font-weight:600;color:#06446a;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">You've been assigned to a new ticket.</p>
    ${infoHtml}
    ${button({ href: url, label: "View ticket", branding })}
    ${sig.html}
  `;

  const text = [
    `Hi ${firstName(assigneeName)},`,
    "",
    `${assignedByName} assigned you to ticket ${humanId}: ${ticketTitle}.`,
    "",
    `View ticket: ${url}`,
    "",
    sig.text,
  ].join("\n");

  return {
    subject: `${assignedByName} assigned ${humanId} to you`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `${assignedByName} assigned ${humanId} to you`,
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    }),
    text,
  };
}
