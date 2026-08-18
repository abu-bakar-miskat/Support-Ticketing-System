/**
 * Provider abstraction seam (slice 14, D-10/EM-05). The inbound-processing
 * pipeline, dedupe, threading, and suppression logic in
 * lib/process-inbound-email.ts are all provider-agnostic — they only ever
 * touch a `NormalizedInboundEmail`. Only fetching a message body/attachment
 * and checking connectivity are provider-specific, so those are the only
 * methods this interface exposes.
 *
 * RESEND is the only implementation today (lib/mail-providers/resend-provider.ts).
 * OAUTH_M365 / OAUTH_GOOGLE / IMAP land behind this same interface later —
 * nothing else in the inbound pipeline needs to change when they do.
 */
import type { MailboxAuthType } from "@/generated/prisma/enums";

export type NormalizedAttachment = {
  id: string;
  filename: string | null;
  contentType: string;
  size: number;
};

export type NormalizedInboundEmail = {
  providerMessageId: string;
  /** Raw "Display Name <addr@example.com>" (or bare address) — parsed by lib/inbound-email.ts's parseFromAddress. */
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  attachments: NormalizedAttachment[];
};

export type MailboxCredentials = { credentialsRef: string | null };

export type HealthCheckResult = { ok: true } | { ok: false; error: string };

export interface MailProvider {
  readonly authType: MailboxAuthType;
  /** Fetch a received message's full body/headers given the provider's opaque message ref. */
  fetchMessage(providerRef: string): Promise<NormalizedInboundEmail | null>;
  /** Resolve a downloadable URL for one attachment on a previously-fetched message. */
  fetchAttachmentUrl(providerRef: string, attachmentId: string): Promise<string | null>;
  /** Lightweight connectivity/auth check for the EM-07 health-check cron. */
  checkHealth(credentials: MailboxCredentials): Promise<HealthCheckResult>;
}
