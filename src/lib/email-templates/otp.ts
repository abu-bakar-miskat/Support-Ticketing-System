import { applyPlaceholders, escapeHtml } from "./_shared";

/**
 * The OTP sign-in email. Unlike the ticket/notification templates, this one is
 * platform-global (login is email-first — there's no tenant/department context
 * when a code is sent) and is edited by a super admin on /platform/settings.
 * The stored override lives on the `otpEmailTemplate` PlatformSetting row; when
 * unset, OTP_DEFAULT below is used, preserving the original hardcoded design.
 *
 * Placeholders: `{{code}}` — the numeric sign-in code; `{{platformName}}` — the
 * company/platform name from platform settings, shown in the header/subject.
 */
export const OTP_PLACEHOLDER_KEYS = ["code", "platformName"] as const;

/** Shape of a super-admin OTP override. `null` means "use OTP_DEFAULT". */
export type OtpEmailTemplate = { subject: string; bodyHtml: string };

/**
 * Built-in default. `bodyHtml` is a full standalone HTML document (the OTP email
 * deliberately does not use the shared email `layout()` — it's a minimal, self
 * contained code delivery). `{{code}}` marks where the sign-in code is injected.
 */
export const OTP_DEFAULT: OtpEmailTemplate = {
  subject: "Your {{platformName}} sign-in code",
  bodyHtml: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your sign-in code</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f6f7f9;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
  color:#1f2937;
">

  <!-- Outer Background -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="width:100%;background:#f6f7f9;">
    <tr>
      <td align="center" style="padding:48px 16px;">

        <!-- Main Container -->
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"
               style="
                 width:100%;
                 max-width:560px;
                 background:#ffffff;
                 border:1px solid #e9eaec;
                 border-radius:16px;
                 overflow:hidden;
               ">

          <!-- Brand Name -->
          <tr>
            <td align="center" style="padding:28px 36px 22px;">
              <div style="
                font-size:18px;
                line-height:26px;
                font-weight:700;
                color:#202124;
              ">
                {{platformName}}
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;">
              <div style="
                height:1px;
                background:#eeeeef;
                font-size:0;
                line-height:0;
              ">&nbsp;</div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td align="center" style="padding:34px 40px 40px;">

              <h1 style="
                margin:0 0 10px;
                color:#171717;
                font-size:26px;
                line-height:34px;
                font-weight:700;
                letter-spacing:-0.4px;
              ">
                Your sign-in code
              </h1>

              <p style="
                max-width:400px;
                margin:0 auto 28px;
                color:#6b7280;
                font-size:14px;
                line-height:22px;
              ">
                Use the verification code below to securely sign in to
                {{platformName}}.
              </p>

              <!-- OTP Container -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="
                    padding:22px 16px;
                    background:#fff7f5;
                    border:1px solid #ffdcd3;
                    border-radius:12px;
                  ">

                    <div style="
                      margin-bottom:7px;
                      color:#9a5a4c;
                      font-size:11px;
                      line-height:16px;
                      font-weight:600;
                      letter-spacing:1px;
                      text-transform:uppercase;
                    ">
                      Verification Code
                    </div>

                    <div style="
                      color:#ef492f;
                      font-size:34px;
                      line-height:44px;
                      font-weight:700;
                      letter-spacing:8px;
                    ">
                      {{code}}
                    </div>

                  </td>
                </tr>
              </table>

              <!-- Expiry Message -->
              <p style="
                margin:22px 0 0;
                color:#6b7280;
                font-size:13px;
                line-height:20px;
              ">
                This code will expire in a few minutes for your security.
              </p>

              <!-- Security Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                     style="margin-top:28px;">
                <tr>
                  <td style="
                    padding:14px 16px;
                    background:#f8f9fa;
                    border-radius:8px;
                    text-align:left;
                  ">
                    <p style="
                      margin:0;
                      color:#6b7280;
                      font-size:12px;
                      line-height:19px;
                    ">
                      <strong style="color:#4b5563;">Didn't request this?</strong>
                      You can safely ignore this email. Never share your
                      verification code with anyone.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"
               style="width:100%;max-width:560px;">
          <tr>
            <td align="center" style="padding:22px 24px 0;">

              <p style="
                margin:0 0 5px;
                color:#9ca3af;
                font-size:11px;
                line-height:17px;
              ">
                {{platformName}}
              </p>

              <p style="
                margin:0;
                color:#b1b5bb;
                font-size:11px;
                line-height:17px;
              ">
                This is an automated security message. Please do not reply.
              </p>

            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`,
};

/**
 * Render the OTP email, honoring a super-admin override when present. The code
 * and platform name are HTML-escaped for the subject/HTML body and kept raw for
 * the plain-text part. `platformName` is the company/platform name shown in the
 * header and subject (falls back to "Global Support Portal" when unset).
 */
export function renderOtpEmail(
  code: string,
  platformName: string,
  override?: Partial<OtpEmailTemplate> | null,
): { subject: string; html: string; text: string } {
  const name = platformName.trim() || "Global Support Portal";
  const subjectTemplate = override?.subject?.trim() || OTP_DEFAULT.subject;
  const bodyHtml = override?.bodyHtml?.trim() || OTP_DEFAULT.bodyHtml;
  const subject = applyPlaceholders(subjectTemplate, { platformName: name });
  const html = applyPlaceholders(bodyHtml, {
    code: escapeHtml(code),
    platformName: escapeHtml(name),
  });
  const text = `Your ${name} sign-in code is: ${code}\n\nThe code expires in a few minutes. If you did not request it, you can ignore this email.`;
  return { subject, html, text };
}
