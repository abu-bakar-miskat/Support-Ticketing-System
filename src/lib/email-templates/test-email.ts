import type { EmailBranding } from "@/lib/email-config";
import { BASE_URL, button, escapeHtml, firstName, layout } from "./_shared";

/** The settings page's "Send a test email" message. */
export function renderTestEmail(args: { recipientName: string; brandName: string; branding: EmailBranding }) {
  const name = escapeHtml(firstName(args.recipientName || "there"));
  const html = layout({
    heading: "Your email settings are working",
    preheader: `Test email from your ${args.brandName} helpdesk`,
    branding: args.branding,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">Hi ${name},</p>
      <p style="margin:0 0 24px 0;">This is a test message confirming that your mailbox is connected and your email branding renders correctly. If you can read this, you're all set.</p>
      ${button({ href: BASE_URL, label: `Open ${escapeHtml(args.brandName)}`, branding: args.branding })}
      <p style="margin:24px 0 0 0;color:#6b7280;">— ${escapeHtml(args.brandName)}</p>
    `,
  });
  const text = `Hi ${firstName(args.recipientName || "there")},\n\nThis is a test message confirming that your mailbox is connected. If you can read this, you're all set.\n\n— ${args.brandName}`;
  return { subject: `Test email — ${args.brandName} helpdesk`, html, text };
}
