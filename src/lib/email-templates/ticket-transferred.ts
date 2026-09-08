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

export function renderTicketTransferred({
  recipientName,
  ticketId,
  humanId,
  ticketTitle,
  fromSubDepartmentName,
  toSubDepartmentName,
  transferredByName,
  branding,
}: {
  recipientName: string;
  ticketId: string;
  humanId: string;
  ticketTitle: string;
  fromSubDepartmentName: string;
  toSubDepartmentName: string;
  transferredByName: string;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(recipientName));
  const url = ensureAbsoluteUrl(`${BASE_URL}/tickets/${ticketId}`);

  const infoRows = [
    { label: "Ticket ID", value: humanId },
    { label: "Title", value: ticketTitle },
    { label: "From", value: fromSubDepartmentName },
    { label: "To", value: toSubDepartmentName },
    { label: "Transferred by", value: transferredByName },
  ];

  const heading = "A ticket was transferred";
  const bodyHtml = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">${escapeHtml(transferredByName)} transferred a ticket from <strong>${escapeHtml(fromSubDepartmentName)}</strong> to <strong>${escapeHtml(toSubDepartmentName)}</strong>.</p>
    ${summaryTable(infoRows)}
    ${button({ href: url, label: "View ticket", branding })}
    <p style="margin:24px 0 0 0;color:#6b7280;">— PEN Support</p>
  `;

  const text = [
    `Hi ${firstName(recipientName)},`,
    "",
    `${transferredByName} transferred ticket ${humanId} (${ticketTitle}) from ${fromSubDepartmentName} to ${toSubDepartmentName}.`,
    "",
    `View ticket: ${url}`,
    "",
    "— PEN Support",
  ].join("\n");

  return {
    subject: `${humanId} was transferred to ${toSubDepartmentName}`,
    html: layout({
      heading,
      bodyHtml,
      preheader: `${transferredByName} transferred ${humanId} to ${toSubDepartmentName}`,
      branding,
    }),
    text,
  };
}
