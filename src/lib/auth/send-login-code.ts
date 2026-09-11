import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/lib/email-templates/_shared";
import { isAuthEmailConfigured, sendAuthEmail } from "@/lib/email-transport";

const DEFAULT_FROM = "PEN Support <onboarding@mail.pengroup.com>";
const RESEND_WINDOW_MS = 60_000;
const lastSentAt = new Map<string, number>();

export type SendLoginCodeResult =
  | { error: string; verificationType?: never }
  | { error: null; verificationType: "signup" | "magiclink" };

/**
 * Mint a Supabase email OTP without asking Supabase to render/send its hosted
 * Magic Link template, then deliver only the numeric code through the auth
 * email transport (Resend in production, Mailpit when platform dev mode is on).
 */
export async function sendLoginCode(email: string): Promise<SendLoginCodeResult> {
  const now = Date.now();
  const previous = lastSentAt.get(email) ?? 0;
  if (now - previous < RESEND_WINDOW_MS) {
    return { error: "Please wait a minute before requesting another code." };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !(await isAuthEmailConfigured())) {
    return { error: "Email sign-in is not configured. Please contact support." };
  }

  const admin = createAdminClient();
  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) return { error: linkError.message };

  const code = data.properties?.email_otp;
  if (!code) return { error: "Could not generate a sign-in code. Please try again." };
  const verificationType = data.properties?.verification_type;
  if (verificationType !== "signup" && verificationType !== "magiclink") {
    return { error: "Could not generate a sign-in code. Please try again." };
  }

  const safeCode = escapeHtml(code);
  const result = await sendAuthEmail({
    from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
    to: email,
    subject: "Your PEN Support sign-in code",
    html: `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#f8f8fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#06476f"><table role="presentation" width="100%"><tr><td align="center"><table role="presentation" width="560" style="max-width:560px;width:100%"><tr><td style="padding:24px 30px;background:#022941;border-radius:8px 8px 0 0;color:#fff;font-size:20px;font-weight:700">PEN <span style="color:#43b5e8">Support</span></td></tr><tr><td style="padding:36px 40px;background:#fff;border-radius:0 0 8px 8px"><h1 style="margin:0 0 16px;color:#0a76b9;font-size:25px">Your sign-in code</h1><p style="margin:0 0 24px;font-size:15px;line-height:1.6">Enter this code on the sign-in page:</p><p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:7px;color:#022941">${safeCode}</p><p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6">The code expires in a few minutes. If you did not request it, you can ignore this email.</p></td></tr></table></td></tr></table></body></html>`,
    text: `Your PEN Support sign-in code is: ${code}\n\nThe code expires in a few minutes. If you did not request it, you can ignore this email.`,
  });

  if (!result.ok) return { error: result.error };
  lastSentAt.set(email, now);
  return { error: null, verificationType };
}
