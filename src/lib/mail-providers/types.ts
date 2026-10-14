/**
 * Provider abstraction seam (slice 14, D-10/EM-05). The inbound-processing
 * pipeline, dedupe, threading, and suppression logic in
 * lib/process-inbound-email.ts are all provider-agnostic — they only ever
 * touch a `NormalizedInboundEmail`.
 *
 * Providers are polled by the mailbox-sync cron from a per-connection cursor
 * ({@link PullMailProvider}, lib/mailbox-sync.ts). OAUTH_M365 is the only one.
 */
import type { MailboxAuthType } from "@/generated/prisma/enums";

export type NormalizedAttachment = {
  id: string;
  filename: string | null;
  contentType: string;
  size: number;
  /** The attachment's bytes (providers parse the full MIME message). */
  content: Buffer;
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
  /** RFC 5322 Message-ID (pull providers read it from the MIME headers). */
  messageId?: string | null;
};

export type HealthCheckResult = { ok: true } | { ok: false; error: string };

// ─── Pull providers ─────────────────────────────────────────────────────────

/** Decrypted `credentialsRef` for an OAuth (Microsoft 365) connection. */
export type OAuthMailboxCredentials = {
  kind: "oauth";
  refreshToken: string;
  accessToken?: string;
  /** Epoch ms the access token stops being valid. */
  expiresAt?: number;
  /** The account that signed in and granted access. */
  account: string;
  /** The mailbox read on that account's behalf (an M365 shared mailbox), when
   *  it differs from `account`. */
  mailbox?: string;
};

export type PullCredentials = OAuthMailboxCredentials;

export type PullContext<C extends PullCredentials = PullCredentials> = {
  credentials: C;
  /** Persists rotated credentials (e.g. a refreshed OAuth token). */
  saveCredentials: (next: C) => Promise<void>;
};

/** One fetched message plus the cursor to persist once it has been processed. */
export type PulledMessage = { email: NormalizedInboundEmail; cursorAfter: unknown };

export type PullBatch = {
  messages: PulledMessage[];
  /** Cursor to persist when `messages` is empty but the provider moved on anyway. */
  cursor?: unknown;
};

/** A provider-side failure. `auth` failures mean the admin must reconnect. */
export class MailProviderError extends Error {
  constructor(message: string, readonly kind: "auth" | "unreachable" = "unreachable") {
    super(message);
    this.name = "MailProviderError";
  }
}

export interface PullMailProvider<C extends PullCredentials = PullCredentials> {
  readonly authType: MailboxAuthType;
  /** Cursor marking "now", so connecting a mailbox never imports its history. */
  initialCursor(ctx: PullContext<C>): Promise<unknown>;
  /** Messages received after `cursor`, oldest first, at most `limit`. */
  fetchNewMessages(ctx: PullContext<C>, cursor: unknown, limit: number): Promise<PullBatch>;
  checkHealth(ctx: PullContext<C>): Promise<HealthCheckResult>;
}
