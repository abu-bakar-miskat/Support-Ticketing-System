# Legacy Supabase Magic Link Email Template

> **Not used by the current login flow.** The app now generates a Supabase OTP
> server-side and sends the numeric code through Resend. This prevents the
> hosted template from changing an OTP request into a clickable magic link.
> Keep this document only for deployments that intentionally restore magic-link login.

Branded one-click sign-in email for Supabase Auth (magic link flow).
Matches the Global Support Portal email system (`src/lib/email-templates/_shared.ts`):
navy header, white card, brand-blue heading, and the "Need Help?" footer block.

## Where this goes

Supabase Dashboard → **Authentication → Emails → Magic Link** → **Source** tab →
paste the HTML below → **Save**. (If you also invite users, the **Invite user** template
uses the same `{{ .ConfirmationURL }}` variable and can reuse this markup.)

## Required Supabase config

The magic link only works if the redirect target is allow-listed:

- **Authentication → URL Configuration → Site URL** → your production URL
  (e.g. `https://ticketing-system.pengroup.com`).
- **Authentication → URL Configuration → Redirect URLs** → add
  `https://ticketing-system.pengroup.com/auth/callback` **and** any preview/local
  origins you sign in from, e.g. `http://localhost:3000/auth/callback`.

The app sends users a link back to `/auth/callback`, which exchanges the code/token for a
session (`src/app/auth/callback/route.ts`). A redirect URL that isn't allow-listed makes
Supabase drop the `next`/redirect and the link fails.

> **Same-browser requirement:** with the PKCE flow (default for `@supabase/ssr`), the link
> must be opened in the **same browser** that requested it — the code verifier lives in a
> cookie set at request time. This is expected; users requesting on desktop should click the
> link on desktop.

## Supabase variables used

| Variable                  | Renders                                          |
| ------------------------- | ------------------------------------------------ |
| `{{ .ConfirmationURL }}`  | The one-click sign-in link (back to `/auth/callback`) |
| `{{ .SiteURL }}`          | Your site URL — used only in the plain-text notice    |

> Supabase builds `{{ .ConfirmationURL }}` from the request's `emailRedirectTo` plus the
> Redirect URL allow-list. Do not hard-code a URL in the template — always use the variable.

---

## HTML template

```html
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">Sign in to Global Support Portal — your one-click link is inside.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f8fc;padding:32px 16px;">
      <tr>
        <td align="center">

          <!-- Card -->
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
            <!-- Header (text wordmark, no logo image) -->
            <tr>
              <td style="background:#022941;border-radius:8px 8px 0 0;padding:26px 32px;text-align:left;">
                <span style="font-size:20px;font-weight:700;letter-spacing:0.5px;color:#ffffff;">PEN <span style="color:#43b5e8;">Support</span></span>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="background:#ffffff;border-radius:0 0 8px 8px;padding:36px 40px;">
                <h1 style="margin:0 0 20px 0;font-size:26px;line-height:1.3;font-weight:700;color:#0a76b9;text-align:left;">Sign in to Global Support Portal</h1>

                <div style="font-size:15px;line-height:1.6;color:#06476f;">
                  <p style="margin:0 0 24px 0;">Click the button below to finish signing in. The link stays valid for the next few minutes and can be used once.</p>

                  <!-- Signature element: the sign-in button -->
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
                    <tr>
                      <td align="center" style="padding:12px 0 20px 0;">
                        <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;background:#43b5e8;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Sign in to Global Support Portal</a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="font-size:12px;line-height:1.6;color:#6b7280;">
                        Button not working? Paste this link into your browser:<br />
                        <a href="{{ .ConfirmationURL }}" style="color:#0a76b9;word-break:break-all;">{{ .ConfirmationURL }}</a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0 0 4px 0;color:#6b7280;">Didn't request this? You can safely ignore this email — no changes will be made to your account without this link.</p>
                  <p style="margin:24px 0 0 0;color:#6b7280;">— Global Support Portal</p>
                </div>

                <div style="height:1px;background:#d3d3fa;margin:28px 0 20px 0;"></div>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">Never forward this email. Anyone with this link can sign in to your account until it expires.</p>
              </td>
            </tr>
          </table>

          <!-- Footer -->
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin-top:32px;">
            <tr>
              <td style="padding:0 32px 20px 32px;font-size:15px;line-height:1.5;color:#06476f;">
                <p style="margin:0 0 8px 0;font-weight:600;">Need Help?</p>
                <p style="margin:0;">Please reach out to us at <span style="color:#0269af;font-weight:600;">support@penglobalbd.com</span></p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px;font-size:12px;line-height:1.5;color:#6b7280;">
                &copy; 2026 Global Support Portal. This is an automated message.
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## Plain-text fallback (optional)

Supabase's plain-text alternative isn't configurable per-template in the dashboard UI,
but if you send magic links through a custom SMTP hook, use this as the text part:

```text
Sign in to Global Support Portal

Click the link below to finish signing in:

    {{ .ConfirmationURL }}

It stays valid for the next few minutes and can be used once. Never forward this email —
anyone with the link can sign in until it expires.

Didn't request this? You can safely ignore this email.

Need help? Contact support@penglobalbd.com
— Global Support Portal
```

## Notes

- **Colors** are pulled from `src/lib/email-templates/_shared.ts` — header `#022941`,
  heading `#0a76b9`, body text `#06476f`, accent `#43b5e8`, hairline `#d3d3fa`, page `#f8f8fc`.
- **No logo image** — the header is a text wordmark (`Global Support Portal`), so nothing external
  loads and there's no image to be blocked or to trip spam heuristics.
- **Plain link fallback:** the raw `{{ .ConfirmationURL }}` is printed under the button so
  the email still works in clients that suppress styled buttons.
- Update the footer year if you're reading this after 2026.
```
