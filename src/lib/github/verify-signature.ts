import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Verifies GitHub's X-Hub-Signature-256 header: HMAC-SHA256 of the raw request
 * body, hex-encoded, prefixed with "sha256=". Timing-safe comparison.
 */
export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false
  const expected = Buffer.from(
    createHmac("sha256", secret).update(rawBody).digest("hex"),
    "hex",
  )
  const provided = Buffer.from(signatureHeader.slice("sha256=".length), "hex")
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
