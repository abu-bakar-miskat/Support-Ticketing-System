import { stripHtml } from "./_shared";
import { hasSignatureContent } from "../sanitize-signature-html";

/** Wraps the user's pasted signature HTML (already sanitized) with a little top spacing. */
export function renderSignatureHtml(signatureHtml: string): string {
  return `<div style="padding:18px 0 0 0;">${signatureHtml}</div>`;
}

/** Plain-text rendering of the same signature, for the text/plain email part. */
export function renderSignatureText(signatureHtml: string): string {
  return stripHtml(signatureHtml);
}

/** A signature only renders once the pasted HTML has actual content. */
export function isSignatureHtmlSet(html: string | null | undefined): html is string {
  return Boolean(html && hasSignatureContent(html));
}
