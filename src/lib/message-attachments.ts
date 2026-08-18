import { IMAGE_TYPES, DOC_TYPES } from "@/lib/mime"

/** Per-file cap for inbound (email) attachments. */
export const INBOUND_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/** Conservative total-payload cap for outbound (Resend hard limit is 40 MB). */
export const OUTBOUND_MAX_TOTAL_BYTES = 25 * 1024 * 1024 // 25 MB

/** Per-file cap for comment/reply attachments (CM-04). */
export const COMMENT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024 // 25 MB

/** CM-04: images, PDF, office/OpenDocument, text/CSV, and zip — no video, no executables. */
const COMMENT_ALLOWED_MIME_TYPES = new Set<string>([...IMAGE_TYPES, ...DOC_TYPES])

const BLOCKED_MIME_TYPES = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "application/x-shellscript",
  "application/bat",
  "application/x-bat",
  "text/x-shellscript",
  "application/x-python",
  "application/x-perl",
  "application/x-php",
  "application/vnd.microsoft.portable-executable",
  "application/x-dosexec",
  "application/x-msdos-program",
])

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com",
  ".sh", ".bash", ".zsh",
  ".ps1", ".psm1", ".psd1",
  ".vbs", ".vbe", ".wsf", ".wsh",
  ".py", ".pyw",
  ".rb", ".pl", ".php",
  ".jar",
  ".app", ".dmg",
  ".msi", ".deb", ".rpm",
])

/**
 * Classify an attachment before storage.
 *
 * Returns:
 * - "ok"           — safe to store and serve
 * - "too_large"    — exceeds the per-file cap; caller should drop inbound / reject outbound
 * - "blocked_type" — executable/script; store with `status:"blocked_type"`, never serve for download
 */
export function classifyAttachment(
  mimeType: string,
  size: number,
  filename?: string | null,
): "ok" | "too_large" | "blocked_type" {
  if (size > INBOUND_MAX_BYTES) return "too_large"

  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim()
  if (BLOCKED_MIME_TYPES.has(normalizedMime)) return "blocked_type"

  if (filename) {
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase()
    if (BLOCKED_EXTENSIONS.has(ext)) return "blocked_type"
  }

  return "ok"
}

/**
 * CM-04: classify a comment/reply attachment before storage — a stricter,
 * allowlist-based check than {@link classifyAttachment} (which only
 * blocklists executables, since inbound email can legitimately carry almost
 * any file type). Staff-authored comment/reply attachments are restricted to
 * images, PDF, office/OpenDocument, text/CSV, and zip, capped at 25 MB.
 */
export function classifyCommentAttachment(
  mimeType: string,
  size: number,
  filename?: string | null,
): "ok" | "too_large" | "blocked_type" {
  if (size > COMMENT_ATTACHMENT_MAX_BYTES) return "too_large"

  const normalizedMime = mimeType.toLowerCase().split(";")[0].trim()
  if (BLOCKED_MIME_TYPES.has(normalizedMime)) return "blocked_type"

  if (filename) {
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase()
    if (BLOCKED_EXTENSIONS.has(ext)) return "blocked_type"
  }

  if (!COMMENT_ALLOWED_MIME_TYPES.has(normalizedMime)) return "blocked_type"

  return "ok"
}
