import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/auth-redirect";
import { completeLogin, type LoginCookie } from "@/lib/auth/complete-login";
import { ensureDevTestAccount, isDevTestAccount } from "@/lib/auth/dev-test-accounts";

const DEV_BYPASS_CODE = "12345678";

const isDevBypassEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.ALLOW_DEV_OTP_BYPASS === "true";

async function resolveDevBypassToken(
  email: string,
): Promise<
  { token: string; verificationType: "signup" | "magiclink" } | { error: string }
> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Dev login unavailable: SUPABASE_SERVICE_ROLE_KEY is not set" };
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) return { error: `Dev login failed: ${error.message}` };
  const otp = data.properties?.email_otp;
  if (!otp) {
    return { error: `Dev login failed: no OTP returned for ${email}` };
  }
  const verificationType = data.properties?.verification_type;
  if (verificationType !== "signup" && verificationType !== "magiclink") {
    return {
      error: `Dev login failed: unexpected verification type ${verificationType ?? "unknown"}`,
    };
  }
  return { token: otp, verificationType };
}

export type VerifyOtpInput = {
  email: string;
  token: string;
  next?: string;
  verificationType?: string;
};

export type VerifyOtpOutcome = {
  redirectTo: string;
  cookies: LoginCookie[];
};

/**
 * Verify an emailed OTP, accept a pending invite when `next` is an invite
 * deep-link, and return the landing path + cookies. Callers attach `cookies`
 * to their HTTP response (Route Handler or server action).
 */
export async function runVerifyOtp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: VerifyOtpInput,
): Promise<VerifyOtpOutcome> {
  const started = Date.now();
  const email = input.email.trim().toLowerCase();
  const token = input.token.replace(/\D/g, "");
  const next = safeNextPath(input.next ?? "");
  const requestedType = input.verificationType ?? "";

  const backQuery =
    `&email=${encodeURIComponent(email)}` +
    `&verificationType=${requestedType === "signup" ? "signup" : "magiclink"}` +
    (next !== "/" ? `&next=${encodeURIComponent(next)}` : "");

  if (!email || token.length < 6) {
    return {
      redirectTo: `/login?step=sent&error=${encodeURIComponent("Enter the code from your email")}${backQuery}`,
      cookies: [],
    };
  }

  let effectiveToken = token;
  let verificationType: "signup" | "magiclink" =
    requestedType === "signup" ? "signup" : "magiclink";
  const isTestAccount = isDevTestAccount(email);
  if (token === DEV_BYPASS_CODE && (isDevBypassEnabled || isTestAccount)) {
    if (isTestAccount) {
      await ensureDevTestAccount(email);
    }
    const result = await resolveDevBypassToken(email);
    if ("error" in result) {
      console.error("[verifyOtpCode] dev bypass:", result.error);
      return {
        redirectTo: `/login?step=sent&error=${encodeURIComponent(result.error)}${backQuery}`,
        cookies: [],
      };
    }
    effectiveToken = result.token;
    verificationType = result.verificationType;
  }

  const verifyStarted = Date.now();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: effectiveToken,
    type: verificationType,
  });
  console.info(`[verifyOtpCode] supabase.verifyOtp ${Date.now() - verifyStarted}ms`);

  if (error || !data.user) {
    return {
      redirectTo: `/login?step=sent&error=${encodeURIComponent(error?.message ?? "That code is invalid or has expired")}${backQuery}`,
      cookies: [],
    };
  }

  const loginStarted = Date.now();
  const { redirectPath, cookies } = await completeLogin({
    supabase,
    user: data.user,
    next,
  });
  console.info(
    `[verifyOtpCode] completeLogin ${Date.now() - loginStarted}ms → ${redirectPath} (total ${Date.now() - started}ms)`,
  );

  return { redirectTo: redirectPath, cookies };
}
