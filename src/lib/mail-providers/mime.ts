import "server-only";
import { simpleParser, type AddressObject } from "mailparser";
import type { NormalizedInboundEmail } from "./types";

/**
 * Microsoft Graph's `$value` hands back the full RFC 5322 message, so one
 * parser normalizes it into the shape the inbound pipeline already
 * understands (and any future pull provider can reuse it).
 */
export async function parseRawMime(raw: Buffer, providerMessageId: string): Promise<NormalizedInboundEmail> {
  const parsed = await simpleParser(raw, { skipTextToHtml: true, skipImageLinks: true });

  // Raw header lines keep threading headers (In-Reply-To/References,
  // Auto-Submitted, Precedence…) as plain strings, matching what Resend hands
  // the pipeline. First occurrence wins (Received: etc. repeat).
  const headers: Record<string, string> = {};
  for (const { key, line } of parsed.headerLines) {
    if (key in headers) continue;
    const colon = line.indexOf(":");
    headers[key] = (colon === -1 ? "" : line.slice(colon + 1)).replace(/\r?\n[ \t]+/g, " ").trim();
  }

  const sender = parsed.from?.value[0];
  const from = sender?.address
    ? sender.name ? `${sender.name} <${sender.address}>` : sender.address
    : parsed.from?.text ?? "";

  return {
    providerMessageId,
    messageId: parsed.messageId ?? null,
    from,
    to: [...addresses(parsed.to), ...addresses(parsed.cc)],
    subject: parsed.subject ?? null,
    text: parsed.text ?? null,
    html: parsed.html || null,
    headers,
    attachments: parsed.attachments.map((att, i) => ({
      id: String(i),
      filename: att.filename ?? null,
      contentType: att.contentType,
      size: att.size,
      content: att.content,
    })),
  };
}

function addresses(field: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(field) ? field : field ? [field] : [];
  return list.flatMap((obj) =>
    obj.value.flatMap((entry) => [entry.address, ...(entry.group ?? []).map((g) => g.address)]),
  ).filter((addr): addr is string => !!addr);
}
