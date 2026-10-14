import "server-only";
import type { MailboxAuthType } from "@/generated/prisma/enums";
import type { PullMailProvider } from "./types";
import { m365Provider } from "./m365-provider";

/**
 * Provider registry (D-10/EM-05). OAUTH_M365 is the only provider: polled by
 * lib/mailbox-sync.ts and used to send (lib/mailbox-outbound.ts). RESEND /
 * OAUTH_GOOGLE / IMAP are enum values with no implementation.
 */
export function getPullMailProvider(authType: MailboxAuthType): PullMailProvider | null {
  if (authType === "OAUTH_M365") return m365Provider;
  return null;
}

export const PULL_AUTH_TYPES = ["OAUTH_M365"] as const satisfies readonly MailboxAuthType[];

export type {
  PullMailProvider,
  NormalizedInboundEmail,
  NormalizedAttachment,
  HealthCheckResult,
  PullCredentials,
  OAuthMailboxCredentials,
} from "./types";
export { MailProviderError } from "./types";
