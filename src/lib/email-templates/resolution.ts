import {
  type Branding,
  escapeHtml,
  firstName,
  layout,
  renderWithOverride,
} from "./_shared";
import type { EmailTemplateOverride } from "../email-config";

export const RESOLUTION_PLACEHOLDER_KEYS = [
  "submitterName",
  "submitterFirstName",
  "formName",
  "ticketTitle",
] as const;

export function renderResolution({
  submitterName,
  formName,
  ticketTitle,
  branding,
  override,
}: {
  submitterName: string;
  formName: string;
  ticketTitle: string;
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(submitterName));
  const form = escapeHtml(formName);
  const title = escapeHtml(ticketTitle);

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        submitterName: name,
        submitterFirstName: escapeHtml(firstName(submitterName)),
        formName: form,
        ticketTitle: title,
      },
      fallbackSubject: `Your request has been resolved — ${formName}`,
      fallbackHeading: "Your request has been resolved",
      preheader: `Your ${formName} request has been resolved`,
      branding,
    });
  }

  const heading = "Your request has been resolved";
  const body = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">Your request <strong>${title}</strong>, submitted via <strong>${form}</strong>, has been resolved.</p>
    <p style="margin:24px 0 0 0;color:#6b7280;">Thank you for reaching out. — PEN Support</p>
  `;

  const text = [
    `Hi ${firstName(submitterName)},`,
    "",
    `Your request "${ticketTitle}", submitted via ${formName}, has been resolved.`,
    "",
    "Thank you for reaching out. — PEN Support",
  ].join("\n");

  return {
    subject: `Your request has been resolved — ${formName}`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `Your ${formName} request has been resolved`,
      branding,
    }),
    text,
  };
}
