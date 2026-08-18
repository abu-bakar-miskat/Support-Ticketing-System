import "server-only"
import { Resend } from "resend"

let resendClient: Resend | null = null

/** Lazily create the Resend client so missing API keys don't crash module load at build time. */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  if (!resendClient) resendClient = new Resend(apiKey)
  return resendClient
}
