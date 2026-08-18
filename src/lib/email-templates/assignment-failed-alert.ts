import {
  BASE_URL,
  type Branding,
  button,
  escapeHtml,
  ensureAbsoluteUrl,
  firstName,
  layout,
  summaryTable,
} from "./_shared";

export function renderAssignmentFailedAlert({
  managerName,
  ticketId,
  humanId,
  ticketTitle,
  branding,
}: {
  managerName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(managerName));
  const title = escapeHtml(ticketTitle);
  const id = escapeHtml(humanId);
  const url = ensureAbsoluteUrl(`${BASE_URL}/tickets/${ticketId}`);
  const subject = `Assignment failed — ${humanId} needs a manual assignee`;

  const infoRows = [
    { label: "Ticket ID", value: humanId },
    { label: "Title", value: ticketTitle },
  ];

  const heading = "A ticket couldn't be auto-assigned";
  const body = `
    <p style="margin:0 0 16px 0;font-weight:600;color:#06446a;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">No eligible agent was found for ticket ${id} — it's been left unassigned and needs a manual assignee.</p>
    ${summaryTable(infoRows)}
    ${button({ href: url, label: "View ticket", branding })}
  `;

  const text = [
    `Hi ${firstName(managerName)},`,
    "",
    `No eligible agent was found for ticket ${humanId} — ${title}. It's been left unassigned and needs a manual assignee.`,
    "",
    `View ticket: ${url}`,
  ].join("\n");

  return {
    subject,
    html: layout({ heading, bodyHtml: body, preheader: subject, branding }),
    text,
  };
}
