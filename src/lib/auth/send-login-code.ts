import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { renderOtpEmail } from "@/lib/email-templates/otp";
import { isAuthEmailConfigured, sendAuthEmail } from "@/lib/email-transport";
import { getPlatformSettings } from "@/lib/platform-settings";

const DEFAULT_FROM = "PEN Support <onboarding@mail.pengroup.com>";
// Server-side backstop for the 90s resend cooldown enforced in the UI. Keeps a
// user (or a bypassed client) from hammering the mail server with back-to-back
// code requests.
const RESEND_WINDOW_MS = 90_000;
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
    const wait = Math.ceil((RESEND_WINDOW_MS - (now - previous)) / 1000);
    return { error: `Please wait ${wait} seconds before requesting another code.` };
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

  const { otpEmailTemplate } = await getPlatformSettings();
  const mail = renderOtpEmail(code, otpEmailTemplate);
  const result = await sendAuthEmail({
    from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
    to: email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });

  if (!result.ok) return { error: result.error };
  lastSentAt.set(email, now);
  if (result.via === "mailpit") {
    console.info(`[auth] OTP for ${email} delivered via Mailpit (${result.id ?? "no-id"})`);
  }
  return { error: null, verificationType };
}
