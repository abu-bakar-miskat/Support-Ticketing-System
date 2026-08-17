import { type Branding, button, ensureAbsoluteUrl, escapeHtml, firstName, layout } from "./_shared";

export function renderIntakeVerification({
  submitterName,
  formName,
  verifyUrl,
  branding,
}: {
  submitterName: string;
  formName: string;
  verifyUrl: string;
  branding?: Branding;
}): { subject: string; html: string; text: string } {
  const form = escapeHtml(formName);
  const name = escapeHtml(firstName(submitterName));
  const href = ensureAbsoluteUrl(verifyUrl);
  const heading = `Confirm your ${form} request`;

  const body = `
    <p style="margin:0 0 16px 0;">Hi ${name},</p>
    <p style="margin:0 0 20px 0;">Almost there — please confirm this email address to submit your <strong>${form}</strong> request. Your ticket is created only after you confirm.</p>
    ${button({ href, label: "Confirm & submit my ticket", branding })}
    <p style="margin:20px 0 0 0;color:#6b7280;">This link expires in 24 hours. If you didn't make this request, you can safely ignore this email.</p>
    <p style="margin:24px 0 0 0;color:#6b7280;">— PEN Support</p>
  `;

  const text = [
    `Hi ${firstName(submitterName)},`,
    "",
    `Almost there — please confirm this email address to submit your ${formName} request. Your ticket is created only after you confirm.`,
    "",
    `Confirm and submit: ${href}`,
    "",
    "This link expires in 24 hours. If you didn't make this request, you can safely ignore this email.",
    "",
    "— PEN Support",
  ].join("\n");

  return {
    subject: `Confirm your ${formName} request`,
    html: layout({
      heading,
      bodyHtml: body,
      preheader: `Confirm your email to submit your ${formName} request`,
      branding,
    }),
    text,
  };
}
