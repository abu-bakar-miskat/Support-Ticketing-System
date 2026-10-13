import "server-only";
import type { MailboxAuthType } from "@/generated/prisma/enums";
import type { MailProvider, PullMailProvider } from "./types";
import { resendProvider } from "./resend-provider";
import { m365Provider } from "./m365-provider";
import { googleProvider } from "./google-provider";
import { imapProvider } from "./imap-provider";

/**
 * Provider registry (D-10/EM-05). RESEND is push (webhook); OAUTH_M365,
 * OAUTH_GOOGLE and IMAP are pull providers polled by lib/mailbox-sync.ts.
 */
export function getMailProvider(authType: MailboxAuthType): MailProvider | null {
  if (authType === "RESEND") return resendProvider;
  return null;
}

export function getPullMailProvider(authType: MailboxAuthType): PullMailProvider | null {
  switch (authType) {
    case "OAUTH_M365":
      return m365Provider as PullMailProvider;
    case "OAUTH_GOOGLE":
      return googleProvider as PullMailProvider;
    case "IMAP":
      return imapProvider as PullMailProvider;
    default:
      return null;
  }
}

export const PULL_AUTH_TYPES = ["OAUTH_M365", "OAUTH_GOOGLE", "IMAP"] as const satisfies readonly MailboxAuthType[];

export type {
  MailProvider,
  PullMailProvider,
  NormalizedInboundEmail,
  NormalizedAttachment,
  MailboxCredentials,
  HealthCheckResult,
  PullCredentials,
  OAuthMailboxCredentials,
  ImapMailboxCredentials,
} from "./types";
export { MailProviderError } from "./types";
