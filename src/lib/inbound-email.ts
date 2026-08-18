import "server-only"

/**
 * Pure helpers for inbound email processing.
 * All functions are side-effect-free and fully unit-testable.
 */

// ── HTML sanitization ─────────────────────────────────────────────────────────

/** Strip dangerous content from inbound HTML so it is safe to render in the ticket UI. */
export function sanitizeInboundHtml(html: string): string {
  return (
    html
      // Remove <script> blocks and their contents
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      // Remove <style> blocks and their contents
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      // Remove all inline event handler attributes (onclick, onload, onerror, …)
      .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
      // Remove all <img> tags (remote images stripped per spec)
      .replace(/<img\b[^>]*\/?>/gi, "")
      // Remove javascript: href values
      .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
  )
}

// ── Quote / signature stripping ──────────────────────────────────────────────

// Ordered heuristics: the first match wins.
// Each returns the index in the string where the "old" content begins.
const QUOTE_FINDERS: Array<(text: string) => number> = [
  // "On Mon, Jan 1 … wrote:" — Gmail / Apple Mail
  (t) => {
    const m = t.match(/\bOn .{0,300}wrote:\s*$(?=[\n\r]?[>\s])/m)
    return m?.index ?? -1
  },
  // "-----Original Message-----" / "---- Original message ----"
  (t) => {
    const m = t.match(/^-{3,}\s*Original Message\s*-{3,}/im)
    return m?.index ?? -1
  },
  // "From: foo@example.com" on its own line (Outlook reply header)
  (t) => {
    const m = t.match(/^\s*From:\s+\S+@\S+/m)
    return m?.index ?? -1
  },
  // Signature delimiter "-- " or "__" on its own line (RFC 3676)
  (t) => {
    const m = t.match(/(?:^|\n)--\s*\r?\n/)
    return m === null ? -1 : (t.indexOf(m[0]))
  },
  (t) => {
    const m = t.match(/(?:^|\n)__+\s*\r?\n/)
    return m === null ? -1 : (t.indexOf(m[0]))
  },
  // Outlook HTML-to-text signature: embedded images become "[Alt Text]" on their
  // own line. A blank line followed by "[...]" strongly signals a signature block.
  (t) => {
    const m = t.match(/\n[ \t]*\r?\n[ \t]*\[[^\]\r\n]{1,120}\][ \t]*\r?\n/)
    return m === null ? -1 : t.indexOf(m[0])
  },
]

/**
 * Split a plain-text body into new content and quoted history.
 * Returns `quoted: null` when no quote boundary was found.
 */
export function stripQuotedHistory(text: string): { visible: string; quoted: string | null } {
  let splitAt = -1

  for (const find of QUOTE_FINDERS) {
    const idx = find(text)
    if (idx !== -1 && (splitAt === -1 || idx < splitAt)) {
      splitAt = idx
    }
  }

  // Fallback: strip a leading block of ">"-quoted lines
  if (splitAt === -1) {
    const lines = text.split("\n")
    const firstQuotedLine = lines.findIndex((l) => l.trimStart().startsWith(">"))
    if (firstQuotedLine > 0) {
      const visible = lines.slice(0, firstQuotedLine).join("\n").trim()
      if (visible) {
        return { visible, quoted: lines.slice(firstQuotedLine).join("\n").trim() }
      }
    }
    return { visible: text.trim(), quoted: null }
  }

  const visible = text.slice(0, splitAt).trim()
  const quoted = text.slice(splitAt).trim()
  if (!visible) return { visible: text.trim(), quoted: null }
  return { visible, quoted }
}

// ── Auto-reply detection ─────────────────────────────────────────────────────

/** Returns true when the email headers indicate an automated / out-of-office response. */
export function isAutoReply(headers: Record<string, string>): boolean {
  const h: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    h[k.toLowerCase()] = v.toLowerCase()
  }
  const autoSub = h["auto-submitted"]
  if (autoSub && autoSub !== "no") return true
  if (h["x-autoreply"] === "yes") return true
  if (h["x-autorespond"]) return true
  const prec = h["precedence"]
  if (prec === "bulk" || prec === "junk") return true
  return false
}

// ── Body extraction ──────────────────────────────────────────────────────────

/**
 * Strip inline-image text placeholders that email clients leave in the
 * `text/plain` part for embedded/pasted images (the image itself arrives as a
 * separate attachment and is rendered from storage). Examples:
 *   "[image: Screenshot]"  (Gmail)
 *   "[86766363.png]"       (bracketed image filename for a pasted screenshot)
 */
export function stripInlineImagePlaceholders(text: string): string {
  return text
    .replace(/\[image:[^\]\r\n]*\]/gi, "")
    .replace(/\[[^\]\r\n]*\.(?:png|jpe?g|gif|webp|svg|avif|bmp|heic|heif)\]/gi, "")
    // Bracketed URL placeholders (e.g. signature icons: `[https://…/icon]`) that
    // have no file extension — email clients emit these for inline <img>s.
    .replace(/[ \t]*\[https?:\/\/[^\]\s]*\][ \t]*\r?\n?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Derive the stored `bodyHtml` and any quoted history from the raw email parts.
 * Prefers `text/plain`; falls back to sanitized `text/html`.
 */
export function pickBody(
  text: string | null,
  html: string | null,
): { bodyHtml: string; quoted: string | null } {
  if (text && text.trim()) {
    const { visible, quoted } = stripQuotedHistory(text)
    const bodyHtml = stripInlineImagePlaceholders(visible).replace(/\r?\n/g, "<br />")
    return { bodyHtml, quoted }
  }
  if (html && html.trim()) {
    return { bodyHtml: sanitizeInboundHtml(html), quoted: null }
  }
  return { bodyHtml: "", quoted: null }
}

// ── From address parsing ─────────────────────────────────────────────────────

/** Parse "Display Name <addr@example.com>" or bare "addr@example.com". */
export function parseFromAddress(from: string): { name: string; email: string } {
  const angle = from.match(/^(.*?)\s*<([^>]+)>\s*$/)
  if (angle) {
    return {
      name: angle[1].trim().replace(/^["']|["']$/g, ""),
      email: angle[2].trim().toLowerCase(),
    }
  }
  const bare = from.trim()
  return { name: bare, email: bare.toLowerCase() }
}

// ── Header-fallback matching ─────────────────────────────────────────────────

/**
 * Extract all RFC message-IDs referenced in `In-Reply-To` and `References`
 * headers. Returns a deduplicated list for querying stored providerMessageIds.
 */
export function extractReferencedIds(
  inReplyTo: string | null,
  references: string | null,
): string[] {
  const ids = new Set<string>()
  for (const raw of [inReplyTo, references]) {
    if (!raw) continue
    // IDs wrapped in angle brackets: <local@domain>
    for (const m of raw.matchAll(/<([^>]+)>/g)) ids.add(m[1])
    // Also accept bare IDs (no angle brackets in header)
    if (!raw.includes("<")) {
      for (const part of raw.trim().split(/\s+/)) {
        if (part) ids.add(part)
      }
    }
  }
  return [...ids]
}

/**
 * EM-04's last-resort fallback: extract a human ticket reference (e.g.
 * "SUP-42") from a subject line, for when neither the reply token nor the
 * In-Reply-To/References headers matched — e.g. a client that drops custom
 * headers, or a reply typed into a fresh compose window quoting the subject.
 * Matches anywhere in the string (not anchored), case-insensitively.
 */
export function extractTicketReferenceFromSubject(
  subject: string | null | undefined,
): { prefix: string; number: number } | null {
  if (!subject) return null
  const m = subject.match(/\b([A-Za-z]{2,10})-(\d+)\b/)
  if (!m) return null
  return { prefix: m[1].toUpperCase(), number: parseInt(m[2], 10) }
}
