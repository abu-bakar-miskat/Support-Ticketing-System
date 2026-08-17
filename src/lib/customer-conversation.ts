import "server-only";
import { randomBytes } from "node:crypto";
import { INBOUND_DOMAIN } from "@/lib/email-config";

/**
 * Helpers for the two-way customer email conversation on intake tickets.
 *
 * The reply token is a bearer secret carried in the `Reply-To` of every
 * outbound message. It is the entire local part of the reply address, so
 * inbound matching survives clients that strip `+tag` sub-addressing.
 */

const LOCAL_PART_PREFIX = "reply-";

/** Generate a fresh, opaque, URL/email-safe reply token. */
export function generateReplyToken(): string {
  return randomBytes(24).toString("hex"); // 48 hex chars
}

/** Build the `Reply-To` address that routes a customer reply back to a ticket. */
export function buildReplyToAddress(token: string): string {
  return `${LOCAL_PART_PREFIX}${token}@${INBOUND_DOMAIN}`;
}

/**
 * Extract the reply token from an inbound recipient address, or null if the
 * address is not one of ours. Case-insensitive on the domain; tolerant of
 * display-name/angle-bracket forms like `"PEN" <reply-abc@d>`.
 */
export function extractReplyToken(recipient: string): string | null {
  if (!INBOUND_DOMAIN) return null;
  const angle = recipient.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : recipient).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  const local = addr.slice(0, at);
  const domain = addr.slice(at + 1);
  if (domain !== INBOUND_DOMAIN.toLowerCase()) return null;
  if (!local.startsWith(LOCAL_PART_PREFIX)) return null;
  const token = local.slice(LOCAL_PART_PREFIX.length);
  return /^[a-f0-9]{48}$/.test(token) ? token : null;
}
