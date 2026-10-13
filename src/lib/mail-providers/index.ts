import "server-only";
import type { MailboxAuthType } from "@/generated/prisma/enums";
import type { MailProvider, PullMailProvider } from "./types";
import { resendProvider } from "./resend-provider";
import { m365Provider } from "./m365-provider";

/**
 * Provider registry (D-10/EM-05). RESEND is push (webhook); OAUTH_M365 is a
 * pull provider polled by lib/mailbox-sync.ts. OAUTH_GOOGLE / IMAP are enum
 * values with no implementation.
 */
export function getMailProvider(authType: MailboxAuthType): MailProvider | null {
  if (authType === "RESEND") return resendProvider;
  return null;
}

export function getPullMailProvider(authType: MailboxAuthType): PullMailProvider | null {
  if (authType === "OAUTH_M365") return m365Provider;
  return null;
}

export const PULL_AUTH_TYPES = ["OAUTH_M365"] as const satisfies readonly MailboxAuthType[];

export type {
  MailProvider,
  PullMailProvider,
  NormalizedInboundEmail,
  NormalizedAttachment,
  MailboxCredentials,
  HealthCheckResult,
  PullCredentials,
  OAuthMailboxCredentials,
} from "./types";
export { MailProviderError } from "./types";
