import "server-only";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export type DomainVerificationStatus =
  | "verified"
  | "pending"
  | "failed"
  | "not_started"
  | "partially_verified"
  | "partially_failed"
  | "unknown"
  | "not_configured";

/** Looks up the sending domain for an email address against the Resend account's
 * verified domains. Returns "unknown" if the domain isn't registered in Resend
 * at all, and "not_configured" if no Resend API key is set. */
export async function checkDomainVerification(email: string): Promise<{
  domain: string | null;
  status: DomainVerificationStatus;
}> {
  const domain = email.split("@")[1]?.trim().toLowerCase() || null;
  if (!domain) return { domain: null, status: "unknown" };
  if (!resend) return { domain, status: "not_configured" };

  try {
    const { data } = await resend.domains.list();
    const match = data?.data.find((d) => d.name.toLowerCase() === domain);
    if (!match) return { domain, status: "unknown" };
    return { domain, status: match.status };
  } catch {
    return { domain, status: "unknown" };
  }
}
