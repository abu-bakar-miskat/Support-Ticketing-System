export type TicketRef = { prefix: string; number: number }

const REF_RE = /\b([A-Za-z][A-Za-z0-9]*)-(\d+)\b/g

/**
 * Extracts ticket references like "DEV-42" from branch names, PR titles/bodies,
 * and commit messages. Case-insensitive; prefixes are uppercased; deduped.
 */
export function parseTicketRefs(
  ...texts: Array<string | null | undefined>
): TicketRef[] {
  const seen = new Set<string>()
  const refs: TicketRef[] = []
  for (const text of texts) {
    if (!text) continue
    for (const match of text.matchAll(REF_RE)) {
      const prefix = match[1].toUpperCase()
      const number = parseInt(match[2], 10)
      const key = `${prefix}-${number}`
      if (seen.has(key)) continue
      seen.add(key)
      refs.push({ prefix, number })
    }
  }
  return refs
}
