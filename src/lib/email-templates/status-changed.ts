import {
  type Branding,
  escapeHtml,
  firstName,
  layout,
  renderWithOverride,
} from "./_shared";
import type { EmailTemplateOverride } from "../email-config";

export function renderStatusChanged({
  submitterName,
  formName,
  ticketTitle,
  previousStatus,
  newStatus,
  branding,
  override,
}: {
  submitterName: string;
  formName: string;
  ticketTitle: string;
  previousStatus: string;
  newStatus: string;
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(submitterName));
  const form = escapeHtml(formName);
  const title = escapeHtml(ticketTitle);
  const from = escapeHtml(previousStatus);
  const to = escapeHtml(newStatus);

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        submitterName: name,
        submitterFirstName: escapeHtml(firstName(submitterName)),
        formName: form,
        ticketTitle: title,
        previousStatus: from,
        newStatus: to,
      },
      fallbackSubject: `Status update — ${formName}`,
      fallbackHeading: "Your request was updated",
      preheader: `Status changed to ${newStatus}`,
      branding,
    });
  }

  const heading = "Your request was updated";
  const body = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">The status of your request <strong>${title}</strong> (${form}) changed from <strong>${from}</strong> to <strong>${to}</strong>.</p>
    <p style="margin:24px 0 0 0;color:#6b7280;">We'll keep you posted. — Global Support Portal</p>
  `;

  const text = [
    `Hi ${firstName(submitterName)},`,
    "",
    `The status of your request "${ticketTitle}" (${formName}) changed from ${previousStatus} to ${newStatus}.`,
    "",
    "We'll keep you posted. — Global Support Portal",
  ].join("\n");

  return {
    subject: `Status update — ${formName}`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `Status changed to ${newStatus}`,
      branding,
    }),
    text,
  };
}
