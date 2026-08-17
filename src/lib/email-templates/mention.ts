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

export const MENTION_PLACEHOLDER_KEYS = [
  "mentionedName",
  "mentionedFirstName",
  "ticketTitle",
  "ticketUrl",
  "viewTicketButton",
  "signature",
] as const;

export function renderMention({
  mentionedName,
  ticketId,
  ticketTitle,
  signature,
  branding,
  override,
}: {
  mentionedName: string;
  ticketId: string;
  ticketTitle: string;
  signature?: { html: string; text: string } | null;
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(mentionedName));
  const title = escapeHtml(ticketTitle);
  const url = ensureAbsoluteUrl(`${BASE_URL}/tickets/${ticketId}`);
  const sig = signatureBlock(signature);

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        mentionedName: name,
        mentionedFirstName: escapeHtml(firstName(mentionedName)),
        ticketTitle: title,
        ticketUrl: url,
        viewTicketButton: button({ href: url, label: "View ticket", branding }),
        signature: sig.html,
      },
      fallbackSubject: `You were mentioned in "${ticketTitle}"`,
      fallbackHeading: "You were mentioned in a ticket",
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    });
  }

  const infoRows = [{ label: "Ticket", value: ticketTitle }];
  const infoHtml = summaryTable(infoRows);

  const heading = "You were mentioned in a ticket";
  const body = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;">You were mentioned in a comment on the following ticket.</p>
    ${infoHtml}
    ${button({ href: url, label: "View ticket", branding })}
    ${sig.html}
  `;

  const text = [
    `Hi ${firstName(mentionedName)},`,
    "",
    `You were mentioned in a comment on ticket "${ticketTitle}".`,
    "",
    `View ticket: ${url}`,
    "",
    sig.text,
  ].join("\n");

  return {
    subject: `You were mentioned in "${ticketTitle}"`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `You were mentioned in "${ticketTitle}"`,
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    }),
    text,
  };
}
