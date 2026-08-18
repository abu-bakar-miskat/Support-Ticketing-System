export const BRAND = "#0a76b9";
export const BASE_URL = (() => {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? "https://ticketing-system.pengroup.com";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
})();

// Served from the app domain (a pengroup.com subdomain, same registered domain
// as the mail.pengroup.com sender) — off-domain image hosts trip Gmail's spam
// heuristics, which is why this must not live on Supabase storage.
export const LOGO_URL = `${BASE_URL}/images/email-logo-pen.png`;

export const HEADER_BG = "#022941";
const BODY_TEXT_COLOR = "#06476f";
const LINK_COLOR = "#0269af";
const BORDER_COLOR = "#d3d3fa";
const SUPPORT_EMAIL = "support@penglobalbd.com";

const SIGNATURE_LOGO_URL = `${BASE_URL}/images/pen-logo-light.svg`;
const SIGNATURE_ICON_BASE_URL = `${BASE_URL}/images/signature-icons`;
const SIGNATURE_ICON_BG = "rgba(19,161,74,0.1)";
const SIGNATURE_ICON_BORDER = "rgba(19,161,74,0.25)";
const SIGNATURE_TEXT_COLOR = "#042512";

const DUMMY_NAME = "John Doe";
const DUMMY_TITLE = "Support Agent";
const DUMMY_PHONE = "0440 222 6665";
const DUMMY_WEBSITE = "www.pengroup.com";
const DUMMY_ADDRESS = "12th Floor, 1 Harbour Exchange Square, London E14 9GE";

/** One icon-badge + text row in the signature contact column. The badge's
 * border/background live on a fixed 22x22 cell — vertical gaps between rows
 * come from the table's border-spacing, not padding on the badge cell itself,
 * so every badge stays the same height. */
function signatureContactRow(iconFile: string, alt: string, text: string): string {
  return `<tr>
    <td width="22" height="22" style="width:22px;height:22px;background:${SIGNATURE_ICON_BG};border:1px solid ${SIGNATURE_ICON_BORDER};border-radius:5px;text-align:center;vertical-align:middle;">
      <img src="${SIGNATURE_ICON_BASE_URL}/${iconFile}" alt="${alt}" width="12" height="12" style="display:inline-block;width:12px;height:12px;vertical-align:middle;border:0;" />
    </td>
    <td style="padding-left:10px;font-size:13px;color:${SIGNATURE_TEXT_COLOR};vertical-align:middle;">${text}</td>
  </tr>`;
}

/** Placeholder signature card shown when the sender hasn't set up a personal signature.
 * Matches the signature block design from the PEN Ticket Email Newsletter Figma file
 * (node 11:138): name/title, then a logo column separated by a vertical rule from a
 * column of icon-badge contact rows. The name/title are generic placeholders — this
 * card is never tied to a real person. */
export const DUMMY_SIGNATURE_HTML = `<div style="padding:18px 0 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e5e7eb;padding-top:16px;">
  <tr>
    <td style="padding:0 0 4px 0;font-size:16px;font-weight:600;color:#06446a;">${DUMMY_NAME}</td>
  </tr>
  <tr>
    <td style="padding:0 0 14px 0;font-size:13px;color:${SIGNATURE_TEXT_COLOR};">${DUMMY_TITLE}</td>
  </tr>
  <tr>
    <td style="border-top:1px solid #e5e7eb;padding-top:14px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-right:16px;border-right:1px solid #e5e7eb;vertical-align:middle;">
            <img src="${SIGNATURE_LOGO_URL}" alt="PEN Group" width="110" style="display:block;width:110px;height:auto;border:0;" />
          </td>
          <td style="padding-left:16px;vertical-align:middle;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0 8px;">
              ${signatureContactRow("phone.svg", "Phone", DUMMY_PHONE)}
              ${signatureContactRow("email.svg", "Email", SUPPORT_EMAIL)}
              ${signatureContactRow("globe.svg", "Website", DUMMY_WEBSITE)}
              ${signatureContactRow("location.svg", "Address", DUMMY_ADDRESS)}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table></div>`;

const CONFIDENTIALITY_NOTICE =
  "This email and any attachments are confidential and may contain privileged or legally protected information. " +
  "If you are not the intended recipient, any dissemination, distribution, or copying of this email is strictly " +
  "prohibited. If you have received this email in error, please notify the sender immediately and delete it from " +
  "your system. Thank you.";

/** Per-workspace branding overrides applied to a rendered email. */
export type Branding = {
  brandColor?: string;
  headerColor?: string;
  logoUrl?: string;
  footerText?: string;
};

/** Decode common HTML entities so escape is safe to call on already-encoded text. */
export function unescapeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCharCode(n) : _;
    });
}

/** Escape text for HTML email bodies. Idempotent for common entities (e.g. `&gt;`). */
export function escapeHtml(input: string): string {
  return unescapeHtmlEntities(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** First name only, falling back to the full string. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Ensures ticket/email links include a scheme so hrefs work in clients. */
export function ensureAbsoluteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/** Converts legacy `[url]Label` shorthand and bare ticket URLs into proper links/buttons. */
const CTA_BUTTON_LABEL =
  /^(View ticket|Open ticket|View request|See ticket|Open request|View submission)$/i;

const BARE_TICKET_URL =
  /(?:https?:\/\/[^\s<"']+|(?:[a-z0-9.-]+\.)+[a-z]{2,})\/tickets\/[^\s<"'\]]+/gi;

/** Only treat bracket content as a URL when it looks like one — never eat titles like `[Backend]`. */
function looksLikeBracketUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value || value.includes("{{") || value.includes("&lt;")) return false;
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return true;
  // domain.tld or domain.tld/path — requires a real-looking host
  return /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#].*)?$/i.test(value);
}

function linkAnchor(href: string, label: string): string {
  return `<a href="${escapeHtml(ensureAbsoluteUrl(href))}" style="color:${LINK_COLOR};font-weight:600;text-decoration:underline;">${escapeHtml(label)}</a>`;
}

function linkBareTicketUrlsInText(text: string): string {
  return text.replace(BARE_TICKET_URL, (url) => linkAnchor(url, url));
}

export function normalizeTemplateBodyHtml(bodyHtml: string, branding?: Branding): string {
  const withBracketLinks = bodyHtml.replace(
    /\[([^\]\s<]+)\]\s*([^<[\n]+?)(?=\s*<|\s*$)/g,
    (match, rawUrl: string, label: string) => {
      const trimmedLabel = label.trim();
      if (!trimmedLabel || !looksLikeBracketUrl(rawUrl)) return match;
      const href = ensureAbsoluteUrl(rawUrl);
      if (CTA_BUTTON_LABEL.test(trimmedLabel)) {
        return button({ href, label: trimmedLabel, branding });
      }
      return linkAnchor(href, trimmedLabel);
    },
  );

  return withBracketLinks
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith("<") ? part : linkBareTicketUrlsInText(part)))
    .join("");
}

/** Email-safe, table-based CTA button with inline styles. */
const BUTTON_BG = "#43b5e8";

export function button({
  href,
  label,
  branding,
}: {
  href: string;
  label: string;
  branding?: Branding;
}): string {
  const brand = branding?.brandColor || BUTTON_BG;
  const safeHref = escapeHtml(ensureAbsoluteUrl(href));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">
  <tr>
    <td align="center" style="border-radius:6px;background:${brand};">
      <a href="${safeHref}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

export function badge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;background:${color};color:#ffffff;border-radius:12px;font-size:13px;font-weight:600;">${escapeHtml(text)}</span>`;
}

/** Sign-off block: a user's rendered signature card if set, else nothing — the confidentiality
 * notice (shown only when no real signature is present) takes its place in the layout.
 * `hasSignature` tells the caller whether a real personal signature was used, so it can
 * decide whether that notice belongs in the layout. */
export function signatureBlock(
  signature: { html: string; text: string } | null | undefined,
): { html: string; text: string; hasSignature: boolean } {
  if (signature) {
    return {
      html: `<div style="margin:24px 0 0 0;">${signature.html}</div>`,
      text: signature.text,
      hasSignature: true,
    };
  }
  return {
    html: "",
    text: CONFIDENTIALITY_NOTICE,
    hasSignature: false,
  };
}

export function summaryTable(rows: { label: string; value: string }[]): string {
  if (rows.length === 0) return "";
  const rowsHtml = rows
    .map(
      (row) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:12px 16px;font-weight:500;color:#6b7280;font-size:14px;text-align:left;width:30%;">${escapeHtml(row.label)}</td>
      <td style="padding:12px 16px;color:#1f2937;font-size:14px;text-align:left;word-break:break-word;">${escapeHtml(row.value)}</td>
    </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin:16px 0;">${rowsHtml}</table>`;
}

/**
 * Replaces `{{key}}` tokens with pre-escaped values. An unresolved token (a
 * typo, or a placeholder that isn't available for this event) renders as an
 * empty string — never the raw `{{key}}` text (DS-04) — so an admin-authored
 * template mistake degrades gracefully instead of leaking template syntax to
 * a customer.
 */
export function applyPlaceholders(input: string, values: Record<string, string>): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) =>
    key in values ? values[key] : "",
  );
}

/** Rough HTML-to-text conversion for the plain-text part of an admin-authored template. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Renders a template using an admin-authored override, substituting placeholders
 * with pre-escaped values and wrapping the result in the shared branded layout. */
export function renderWithOverride({
  override,
  placeholders,
  fallbackSubject,
  fallbackHeading,
  preheader,
  branding,
  showConfidentialityNotice,
}: {
  override: { subject?: string; heading?: string; bodyHtml?: string; footerText?: string };
  placeholders: Record<string, string>;
  fallbackSubject: string;
  fallbackHeading: string;
  preheader?: string;
  branding?: Branding;
  showConfidentialityNotice?: boolean;
}): { subject: string; html: string; text: string } {
  const subject = applyPlaceholders(override.subject || fallbackSubject, placeholders);
  const heading = applyPlaceholders(override.heading || fallbackHeading, placeholders);
  const bodyHtml = normalizeTemplateBodyHtml(
    applyPlaceholders(override.bodyHtml || "", placeholders),
    branding,
  );
  // DS-05/06: this template's own footer, if set, wins over the department/
  // tenant/platform default carried on `branding.footerText` — falls through
  // to that chain when the template hasn't customized its own footer.
  const footerOverride = override.footerText ? applyPlaceholders(override.footerText, placeholders) : undefined;
  return {
    subject,
    html: layout({ heading, bodyHtml, preheader: preheader ?? subject, branding, showConfidentialityNotice, footerOverride }),
    text: stripHtml(bodyHtml),
  };
}

export function layout({
  heading,
  bodyHtml,
  preheader = "",
  branding,
  showConfidentialityNotice = true,
  footerOverride,
}: {
  heading: string;
  bodyHtml: string;
  preheader?: string;
  branding?: Branding;
  showConfidentialityNotice?: boolean;
  /** DS-05/06: a specific template's own footer, taking precedence over `branding.footerText`. */
  footerOverride?: string;
}): string {
  const brand = branding?.brandColor || BRAND;
  const headerBg = branding?.headerColor || HEADER_BG;
  const logo = branding?.logoUrl || LOGO_URL;
  const normalizedBodyHtml = normalizeTemplateBodyHtml(bodyHtml, branding);
  const year = new Date().getFullYear();
  const footer = (footerOverride || branding?.footerText || `© ${year} PEN Global. This is an automated message.`).replace(
    /\{year\}/g,
    String(year),
  );
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(
        preheader,
      )}</div>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
    ${preheaderHtml}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f8fc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
            <tr>
              <td style="background:${headerBg};border-radius:8px 8px 0 0;padding:24px 32px;text-align:left;">
                <img src="${logo}" alt="PEN" width="130" height="42" style="display:inline-block;border:0;outline:none;text-decoration:none;height:42px;width:auto;" />
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-radius:0 0 8px 8px;padding:36px 40px;">
                <h1 style="margin:0 0 20px 0;font-size:26px;line-height:1.3;font-weight:700;color:${brand};text-align:left;">${heading}</h1>
                <div style="font-size:15px;line-height:1.6;color:${BODY_TEXT_COLOR};">
                  ${normalizedBodyHtml}
                </div>
                ${showConfidentialityNotice
                  ? `<div style="height:1px;background:${BORDER_COLOR};margin:28px 0 20px 0;"></div>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">${escapeHtml(CONFIDENTIALITY_NOTICE)}</p>`
                  : ""}
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin-top:32px;">
            <tr>
              <td style="padding:0 32px 20px 32px;font-size:15px;line-height:1.5;color:${BODY_TEXT_COLOR};">
                <p style="margin:0 0 8px 0;font-weight:600;">Need Help?</p>
                <!-- Plain text, not a mailto: link — penglobalbd.com doesn't match the
                     mail.pengroup.com sending domain and linked mismatches trip spam filters. -->
                <p style="margin:0;">Please reach out to us at <span style="color:${LINK_COLOR};font-weight:600;">${SUPPORT_EMAIL}</span></p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px;font-size:12px;line-height:1.5;color:#6b7280;">
                ${escapeHtml(footer)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
