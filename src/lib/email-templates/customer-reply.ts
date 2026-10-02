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
  const safeAgentName = escapeHtml(agentName);
  const sig = signatureBlock(signature);

  if (override?.bodyHtml) {
    return renderWithOverride({
      override,
      placeholders: {
        submitterName: name,
        submitterFirstName: escapeHtml(firstName(submitterName)),
        ticketTitle: title,
        agentName: safeAgentName,
        messageHtml,
        signature: sig.html,
      },
      fallbackSubject: `Re: ${ticketTitle}`,
      fallbackHeading: "A reply to your request",
      preheader: `Reply from Global Support Portal about ${title}`,
      branding,
    });
  }

  const heading = "A reply to your request";
  const body = `
    <p style="margin:0 0 20px 0;">Hi ${name},</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px 0;border:1px solid #dfe7e3;border-radius:8px;border-collapse:separate;background:#f7faf8;">
      <tr>
        <td style="padding:16px 20px 6px 20px;color:#6b7c74;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Message from ${safeAgentName}</td>
      </tr>
      <tr>
        <td style="padding:6px 20px 20px 20px;color:#26352f;font-size:15px;line-height:1.7;">${messageHtml}</td>
      </tr>
    </table>
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
      preheader: `Reply from Global Support Portal about ${title}`,
      branding,
    }),
    text,
  };
}
