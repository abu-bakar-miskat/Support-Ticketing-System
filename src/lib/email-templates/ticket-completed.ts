import {
  BASE_URL,
  type Branding,
  button,
  escapeHtml,
  ensureAbsoluteUrl,
  firstName,
  layout,
  renderWithOverride,
  summaryTable,
} from "./_shared";
import type { EmailTemplateOverride } from "../email-config";

export const TICKET_COMPLETED_PLACEHOLDER_KEYS = [
  "recipientName",
  "recipientFirstName",
  "humanId",
  "ticketTitle",
  "completedByName",
  "ticketUrl",
  "viewTicketButton",
] as const;

export function renderTicketCompleted({
  recipientName,
  ticketId,
  humanId,
  ticketTitle,
  completedByName,
  branding,
  override,
}: {
  recipientName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  completedByName: string;
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(recipientName));
  const by = escapeHtml(completedByName);
  const id = escapeHtml(humanId);
  const title = escapeHtml(ticketTitle);
  const url = ensureAbsoluteUrl(`${BASE_URL}/tickets/${ticketId}`);

  const infoRows = [
    { label: "Ticket ID", value: humanId },
    { label: "Title", value: ticketTitle },
    { label: "Completed by", value: completedByName },
  ];

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        recipientName: name,
        recipientFirstName: escapeHtml(firstName(recipientName)),
        humanId: id,
        ticketTitle: title,
        completedByName: by,
        ticketUrl: url,
        viewTicketButton: button({ href: url, label: "View ticket", branding }),
      },
      fallbackSubject: `${humanId} has been completed`,
      fallbackHeading: "A ticket has been completed",
      preheader: `${completedByName} completed ${humanId}: ${ticketTitle}`,
      branding,
    });
  }

  const heading = "A ticket has been completed";
  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">The following ticket has been marked as complete.</p>
    ${summaryTable(infoRows)}
    ${button({ href: url, label: "View ticket", branding })}
    <p style="margin:24px 0 0 0;color:#6b7280;">— PEN Support</p>
  `;

  const text = [
    `Hi ${firstName(recipientName)},`,
    "",
    `${completedByName} marked ticket ${humanId} as complete: ${ticketTitle}.`,
    "",
    `View ticket: ${url}`,
    "",
    "— PEN Support",
  ].join("\n");

  return {
    subject: `${humanId} has been completed`,
    html: layout({ heading, bodyHtml, preheader: `${completedByName} completed ${humanId}: ${ticketTitle}`, branding }),
    text,
  };
}
