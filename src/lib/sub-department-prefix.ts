/**
 * Derive a short (2–5 char) uppercase prefix suggestion from a sub-department
 * name. Multi-word names use their initials ("Backend Services" → "BS"); a
 * single word falls back to its leading letters ("Frontend" → "FRO").
 *
 * Shared by the create form (live suggestion) and the API (server-side default)
 * so both produce the same base before uniqueness suffixing is applied.
 */
export function deriveSubDepartmentPrefix(name: string): string {
  const cleaned = name.trim()
  if (!cleaned) return ""
  const words = cleaned.split(/\s+/).filter(Boolean)
  const initials = words
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
  const base =
    initials.length >= 2
      ? initials
      : cleaned.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3)
  return base.slice(0, 5)
}
