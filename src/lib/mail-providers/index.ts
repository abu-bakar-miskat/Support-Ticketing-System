import "server-only";
import type { MailboxAuthType } from "@/generated/prisma/enums";
import type { MailProvider } from "./types";
import { resendProvider } from "./resend-provider";

/**
 * Provider registry (D-10/EM-05). Only RESEND is implemented; the other
 * MailboxAuthType values are reserved for OAuth (M365/Google) and IMAP,
 * which land behind this same {@link MailProvider} interface later.
 */
export function getMailProvider(authType: MailboxAuthType): MailProvider | null {
  if (authType === "RESEND") return resendProvider;
  return null;
}

export type { MailProvider, NormalizedInboundEmail, NormalizedAttachment, MailboxCredentials, HealthCheckResult } from "./types";
