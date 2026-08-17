/** Allow only same-origin relative paths (no protocol-relative or absolute URLs). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return fallback;
  }
  // Block scheme-like paths such as /javascript:...
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(trimmed)) return fallback;
  return trimmed;
}
