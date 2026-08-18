import { escapeHtml, firstName, layout, summaryTable, type Branding } from "./_shared";

export function renderMailboxConnectionFailedAlert({
  managerName,
  address,
  error,
  branding,
}: {
  managerName: string;
  address: string;
  error: string;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(managerName));
  const subject = `Mailbox connection failed — ${address}`;

  const infoRows = [
    { label: "Mailbox", value: address },
    { label: "Error", value: error },
  ];

  const heading = "A mailbox connection needs attention";
  const body = `
    <p style="margin:0 0 16px 0;font-weight:600;color:#06446a;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">The mailbox connection for <strong>${escapeHtml(address)}</strong> failed its health check and new mail may not be creating tickets until this is resolved.</p>
    ${summaryTable(infoRows)}
  `;

  const text = [
    `Hi ${firstName(managerName)},`,
    "",
    `The mailbox connection for ${address} failed its health check and new mail may not be creating tickets until this is resolved.`,
    "",
    `Error: ${error}`,
  ].join("\n");

  return {
    subject,
    html: layout({ heading, bodyHtml: body, preheader: subject, branding }),
    text,
  };
}
