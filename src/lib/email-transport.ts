import "server-only";

import nodemailer from "nodemailer";
import { getResendClient } from "@/lib/resend-client";
import { getPlatformSettings } from "@/lib/platform-settings";

export type EmailAttachment = { content: string | Buffer; filename: string };

export type OutboundEmail = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
};

export type SendOutboundResult =
  | { ok: true; id: string | null; via: "mailpit" | "resend" }
  | { ok: false; error: string };

/**
 * Shared sims-admin Mailpit box. Hardcoded so Preview/prod deploys can flip
 * platform Dev mode without adding Vercel env vars. Env vars still override
 * when present.
 */
const MAILPIT_DEFAULTS = {
  uiBase: "http://3.8.185.28/mailpit.local",
  uiUser: "admin",
  uiPass: "Rj3aJznJdodgGPgVxFoxh3",
  smtpHost: "3.8.185.28",
  smtpPort: 1025,
  smtpUser: "vercel",
  smtpPass: "nEeLiaca59Di3TUIIGDEc8W2",
} as const;

function envOr(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v || fallback;
}

function mailpitConfig() {
  return {
    uiBase: envOr("MAILPIT_UI_BASE", MAILPIT_DEFAULTS.uiBase).replace(/\/$/, ""),
    uiUser: envOr("MAILPIT_UI_USER", MAILPIT_DEFAULTS.uiUser),
    uiPass: envOr("MAILPIT_UI_PASS", MAILPIT_DEFAULTS.uiPass),
    smtpHost: envOr("MAILPIT_SMTP_HOST", MAILPIT_DEFAULTS.smtpHost),
    smtpPort: Number(envOr("MAILPIT_SMTP_PORT", String(MAILPIT_DEFAULTS.smtpPort))),
    smtpUser: envOr("MAILPIT_SMTP_USER", MAILPIT_DEFAULTS.smtpUser),
    smtpPass: envOr("MAILPIT_SMTP_PASS", MAILPIT_DEFAULTS.smtpPass),
  };
}

/** Public UI base for the shared Mailpit inbox (no credentials in the URL). */
export function getMailpitUiBase(): string {
  return mailpitConfig().uiBase;
}

function parseFrom(from: string): { name?: string; address: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1]?.replace(/^["']|["']$/g, "").trim();
    return { name: name || undefined, address: match[2].trim() };
  }
  return { address: from.trim() };
}

function toAddressList(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map((a) => a.trim()).filter(Boolean);
}

async function sendViaMailpitHttp(message: OutboundEmail): Promise<SendOutboundResult> {
  const { uiBase, uiUser, uiPass } = mailpitConfig();

  const from = parseFrom(message.from);
  const payload = {
    From: from.name ? { Email: from.address, Name: from.name } : { Email: from.address },
    To: toAddressList(message.to).map((Email) => ({ Email })),
    Subject: message.subject,
    Text: message.text,
    HTML: message.html,
    ...(message.headers ? { Headers: message.headers } : {}),
  };

  const auth = Buffer.from(`${uiUser}:${uiPass}`).toString("base64");
  try {
    const res = await fetch(`${uiBase}/api/v1/send`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as { ID?: string; Error?: string; error?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: body.Error || body.error || `Mailpit HTTP send failed (${res.status})`,
      };
    }
    return { ok: true, id: body.ID ?? null, via: "mailpit" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Mailpit HTTP send failed";
    return { ok: false, error: msg };
  }
}

async function sendViaMailpitSmtp(message: OutboundEmail): Promise<SendOutboundResult> {
  const { smtpHost, smtpPort, smtpUser, smtpPass } = mailpitConfig();

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(smtpPort) ? smtpPort : MAILPIT_DEFAULTS.smtpPort,
    secure: false,
    auth: { user: smtpUser, pass: smtpPass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10_000,
  });

  try {
    const info = await transport.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      headers: message.headers,
      attachments: message.attachments,
    });
    return { ok: true, id: typeof info.messageId === "string" ? info.messageId : null, via: "mailpit" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Mailpit SMTP send failed";
    return { ok: false, error: msg };
  } finally {
    transport.close();
  }
}

/** Prefer HTTP (works through the reverse proxy); fall back to SMTP. */
async function sendViaMailpit(message: OutboundEmail): Promise<SendOutboundResult> {
  // Attachment encoding over Mailpit's HTTP API is fiddly; SMTP (nodemailer)
  // handles attachments natively, so route those straight to SMTP.
  if (message.attachments?.length) {
    return sendViaMailpitSmtp(message);
  }
  const httpResult = await sendViaMailpitHttp(message);
  if (httpResult.ok) return httpResult;
  const smtpResult = await sendViaMailpitSmtp(message);
  if (smtpResult.ok) return smtpResult;
  return {
    ok: false,
    error: `Mailpit HTTP failed (${httpResult.error}); SMTP failed (${smtpResult.error})`,
  };
}

async function sendViaResend(message: OutboundEmail): Promise<SendOutboundResult> {
  const resend = getResendClient();
  if (!resend) {
    return { ok: false, error: "Email is not configured. Please contact support." };
  }

  const result = await resend.emails.send({
    from: message.from,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo,
    ...(message.headers ? { headers: message.headers } : {}),
    ...(message.attachments ? { attachments: message.attachments } : {}),
  });

  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, id: result.data?.id ?? null, via: "resend" };
}

/**
 * Whether authentication-related mail (OTP, invites) should go to Mailpit.
 * Driven by the platform `devMode` setting.
 */
export async function isAuthEmailDevMode(): Promise<boolean> {
  const { devMode } = await getPlatformSettings();
  return devMode;
}

/**
 * Whether ALL outbound mail (ticket confirmations, assignments, replies, …)
 * should be diverted to Mailpit instead of the real recipient.
 *
 * Local `next dev` always diverts — `NODE_ENV === "development"` is only true on
 * a developer machine, never in a deployed (production/preview) build — so a
 * confirmation for a ticket created via the support form or an inbound mailbox
 * lands in Mailpit rather than emailing a real person. Deployed environments
 * additionally honor the platform `devMode` flag. `DATABASE_URL` is shared, so
 * we must NOT rely on the DB flag alone to tell local dev apart from prod.
 */
export async function isOutboundEmailDevMode(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;
  const { devMode } = await getPlatformSettings();
  return devMode;
}

/**
 * The single chokepoint for business email. In dev mode delivers via Mailpit so
 * no real recipient is ever contacted from a developer machine; otherwise Resend.
 */
export async function sendOutboundEmail(message: OutboundEmail): Promise<SendOutboundResult> {
  if (await isOutboundEmailDevMode()) {
    return sendViaMailpit(message);
  }
  return sendViaResend(message);
}

/**
 * Send OTP / invite / authentication email. In platform dev mode, delivers via
 * Mailpit so any recipient address works and messages land in the shared inbox.
 * Otherwise uses Resend.
 */
export async function sendAuthEmail(message: OutboundEmail): Promise<SendOutboundResult> {
  if (await isAuthEmailDevMode()) {
    return sendViaMailpit(message);
  }
  return sendViaResend(message);
}

/** True when auth email can be attempted (Resend key or Mailpit in dev mode). */
export async function isAuthEmailConfigured(): Promise<boolean> {
  if (await isAuthEmailDevMode()) return true;
  return Boolean(getResendClient());
}
