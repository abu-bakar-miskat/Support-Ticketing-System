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

export function renderIntakeManagerAlert({
  managerName,
  ticketId,
  humanId,
  ticketTitle,
  formName,
  submitterName,
  branding,
}: {
  managerName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  formName: string;
  submitterName: string;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(managerName));
  const title = escapeHtml(ticketTitle);
  const form = escapeHtml(formName);
  const submitter = escapeHtml(submitterName);
  const id = escapeHtml(humanId);
  const url = ensureAbsoluteUrl(`${BASE_URL}/tickets/${ticketId}`);
  const subject = `New ticket from ${formName}: ${humanId}`;

  const infoRows = [
    { label: "Ticket ID", value: humanId },
    { label: "Title", value: ticketTitle },
    { label: "Form", value: formName },
    { label: "Submitted by", value: submitterName },
  ];

  const heading = "A new ticket needs your department's attention";
  const body = `
    <p style="margin:0 0 16px 0;font-weight:600;color:#06446a;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">A new ticket was auto-created from the "${form}" support form.</p>
    ${summaryTable(infoRows)}
    ${button({ href: url, label: "View ticket", branding })}
  `;

  const text = [
    `Hi ${firstName(managerName)},`,
    "",
    `A new ticket was auto-created from the "${formName}" support form: ${humanId} — ${ticketTitle}.`,
    `Submitted by: ${submitterName}`,
    "",
    `View ticket: ${url}`,
  ].join("\n");

  return {
    subject,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: subject,
      branding,
    }),
    text,
  };
}
