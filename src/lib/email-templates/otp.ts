import { applyPlaceholders, escapeHtml } from "./_shared";

/**
 * The OTP sign-in email. Unlike the ticket/notification templates, this one is
 * platform-global (login is email-first — there's no tenant/department context
 * when a code is sent) and is edited by a super admin on /platform/settings.
 * The stored override lives on the `otpEmailTemplate` PlatformSetting row; when
 * unset, OTP_DEFAULT below is used, preserving the original hardcoded design.
 *
 * The only placeholder is `{{code}}` — the numeric sign-in code.
 */
export const OTP_PLACEHOLDER_KEYS = ["code"] as const;

/** Shape of a super-admin OTP override. `null` means "use OTP_DEFAULT". */
export type OtpEmailTemplate = { subject: string; bodyHtml: string };

/**
 * Built-in default. `bodyHtml` is a full standalone HTML document (the OTP email
 * deliberately does not use the shared email `layout()` — it's a minimal, self
 * contained code delivery). `{{code}}` marks where the sign-in code is injected.
 */
export const OTP_DEFAULT: OtpEmailTemplate = {
  subject: "Your Global Support Portal sign-in code",
  bodyHtml: `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#faf5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#4a3b33"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="560" style="max-width:560px;width:100%"><tr><td style="padding:24px 30px;background:#331a0e;border-radius:8px 8px 0 0;color:#fff;font-size:20px;font-weight:700">PEN <span style="color:#fb7a56">Support</span></td></tr><tr><td style="padding:36px 40px;background:#fff;border-radius:0 0 8px 8px"><h1 style="margin:0 0 16px;color:#ef4b23;font-size:25px">Your sign-in code</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.6">Enter this code on the sign-in page:</p><p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:7px;color:#331a0e">{{code}}</p><p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6">The code expires in a few minutes. If you did not request it, you can ignore this email.</p></td></tr></table></td></tr></table></body></html>`,
};

/**
 * Render the OTP email, honoring a super-admin override when present. The code
 * is HTML-escaped for the HTML body and kept raw for the plain-text part.
 */
export function renderOtpEmail(
  code: string,
  override?: Partial<OtpEmailTemplate> | null,
): { subject: string; html: string; text: string } {
  const subject = override?.subject?.trim() || OTP_DEFAULT.subject;
  const bodyHtml = override?.bodyHtml?.trim() || OTP_DEFAULT.bodyHtml;
  const html = applyPlaceholders(bodyHtml, { code: escapeHtml(code) });
  const text = `Your Global Support Portal sign-in code is: ${code}\n\nThe code expires in a few minutes. If you did not request it, you can ignore this email.`;
  return { subject, html, text };
}
