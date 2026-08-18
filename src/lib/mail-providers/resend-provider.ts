import "server-only";
import { getResendClient } from "@/lib/resend-client";
import type { MailProvider, MailboxCredentials, NormalizedInboundEmail, HealthCheckResult } from "./types";

/**
 * The only functional provider today. Wraps the existing Resend inbound API
 * (unchanged from before slice 14) behind {@link MailProvider} — no behavior
 * change for existing mail, just a seam for OAuth/IMAP to land behind later.
 * Uses the platform-wide `RESEND_API_KEY`; `credentials.credentialsRef` is
 * always null for this provider (see lib/mailbox-credentials.ts's docstring).
 */
export const resendProvider: MailProvider = {
  authType: "RESEND",

  async fetchMessage(providerRef: string): Promise<NormalizedInboundEmail | null> {
    const resend = getResendClient();
    if (!resend) return null;

    const { data: email, error } = await resend.emails.receiving.get(providerRef);
    if (error || !email) return null;

    return {
      providerMessageId: providerRef,
      from: email.from,
      to: email.to,
      subject: email.subject ?? null,
      text: email.text ?? null,
      html: email.html ?? null,
      headers: email.headers ?? {},
      attachments: (email.attachments ?? []).map((att) => ({
        id: att.id,
        filename: att.filename ?? null,
        contentType: att.content_type,
        size: att.size,
      })),
    };
  },

  async fetchAttachmentUrl(providerRef: string, attachmentId: string): Promise<string | null> {
    const resend = getResendClient();
    if (!resend) return null;

    const { data, error } = await resend.emails.receiving.attachments.get({
      emailId: providerRef,
      id: attachmentId,
    });
    if (error || !data?.download_url) return null;
    return data.download_url;
  },

  async checkHealth(_credentials: MailboxCredentials): Promise<HealthCheckResult> {
    const resend = getResendClient();
    if (!resend) return { ok: false, error: "RESEND_API_KEY is not configured" };

    try {
      const { error } = await resend.apiKeys.list();
      if (error) return { ok: false, error: error.message ?? "Resend API key rejected" };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error contacting Resend" };
    }
  },
};
