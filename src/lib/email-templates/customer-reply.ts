import {
  type Branding,
  escapeHtml,
  firstName,
  layout,
  renderWithOverride,
  signatureBlock,
  stripHtml,
} from "./_shared";
import type { EmailTemplateOverride } from "../email-config";

export const CUSTOMER_REPLY_PLACEHOLDER_KEYS = [
  "submitterName",
  "submitterFirstName",
  "ticketTitle",
  "agentName",
  "messageHtml",
  "signature",
] as const;

/**
 * A staff reply to the intake submitter. `messageText` is rich-text HTML
 * authored in the reply composer (already sanitized upstream by the messages
 * route), so it is embedded as-is; the plain-text part strips the markup.
 */
export function renderCustomerReply({
  submitterName,
  ticketTitle,
  agentName,
  messageText,
  signature,
  branding,
  override,
}: {
  submitterName: string;
  ticketTitle: string;
  agentName: string;
  /** Sanitized rich-text HTML of the agent's message. */
  messageText: string;
  signature?: { html: string; text: string } | null;
  branding?: Branding;
  override?: EmailTemplateOverride;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(firstName(submitterName));
  const title = escapeHtml(ticketTitle);
  const messageHtml = messageText;
  const sig = signatureBlock(signature);

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        submitterName: name,
        submitterFirstName: escapeHtml(firstName(submitterName)),
        ticketTitle: title,
        agentName: escapeHtml(agentName),
        messageHtml,
        signature: sig.html,
      },
      fallbackSubject: `Re: ${ticketTitle}`,
      fallbackHeading: "A reply to your request",
      preheader: `Reply from PEN Support about ${title}`,
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    });
  }

  const heading = "A reply to your request";
  const body = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <div style="margin:0 0 24px 0;color:#374151;font-size:15px;line-height:1.6;">${messageHtml}</div>
    ${sig.html}
    <p style="margin:16px 0 0 0;color:#9ca3af;font-size:12px;">Reply to this email to continue the conversation.</p>
  `;

  const text = [
    `Hi ${firstName(submitterName)},`,
    "",
    stripHtml(messageText),
    "",
    sig.text,
    "",
    "Reply to this email to continue the conversation.",
  ].join("\n");

  return {
    subject: `Re: ${ticketTitle}`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `Reply from PEN Support about ${title}`,
      branding,
      showConfidentialityNotice: !sig.hasSignature,
    }),
    text,
  };
}
