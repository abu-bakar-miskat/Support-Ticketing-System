import { resolveMx } from "node:dns/promises"

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

// true = domain has MX records, false = domain genuinely can't receive mail
// (ENOTFOUND / ENODATA), null = resolver hiccup/timeout so the caller should
// accept rather than block on transient DNS failures.
export async function domainAcceptsMail(email: string): Promise<boolean | null> {
  const domain = email.split("@")[1]?.trim().toLowerCase()
  if (!domain) return false
  try {
    const mx = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ])
    return mx.length > 0
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "ENOTFOUND" || code === "ENODATA") return false
    return null
  }
}
