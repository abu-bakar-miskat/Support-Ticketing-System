"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/auth-redirect";
import { completeLogin } from "@/lib/auth/complete-login";

/**
 * Fixed code that logs any existing user in on non-production builds only.
 * We never verify it directly — instead we ask Supabase (via the service-role
 * admin client) to mint the real OTP for the email, then redeem that through
 * the normal verifyOtp path so a genuine session is established.
 */
const DEV_BYPASS_CODE = "12345678";

const isDevBypassEnabled = process.env.NODE_ENV !== "production";

/**
 * Mint the email's real OTP via the service-role admin client so the fixed dev
 * code can be redeemed through the normal verifyOtp path. Returns the OTP, or an
 * error string explaining why it couldn't (missing service key, unknown user…).
 */
async function resolveDevBypassToken(
  email: string,
): Promise<{ token: string } | { error: string }> {
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
  if (!otp) return { error: "Dev login failed: no OTP returned for this email" };
  return { token: otp };
}

/**
 * Verify the 6-digit code Supabase emailed alongside the magic link.
 *
 * Unlike the link, an OTP code is never redeemed by email security scanners
 * (Safe Links, corporate mail gateways) and works across browsers/devices — so
 * it sidesteps the "invalid or has expired" failures the single-use link hits
 * when a work-mail gateway prefetches and consumes the token.
 */
export async function verifyOtpCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\D/g, "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  const backQuery =
    `&email=${encodeURIComponent(email)}` +
    (next !== "/" ? `&next=${encodeURIComponent(next)}` : "");

  if (!email || token.length < 6) {
    redirect(
      `/login?step=sent&error=${encodeURIComponent("Enter the code from your email")}${backQuery}`,
    );
  }

  // Dev-only shortcut: the fixed code is swapped for the email's real OTP so
  // the verification below still goes through Supabase and yields a real session.
  let effectiveToken = token;
  if (isDevBypassEnabled && token === DEV_BYPASS_CODE) {
    const result = await resolveDevBypassToken(email);
    if ("error" in result) {
      console.error("[verifyOtpCode] dev bypass:", result.error);
      redirect(
        `/login?step=sent&error=${encodeURIComponent(result.error)}${backQuery}`,
      );
    }
    effectiveToken = result.token;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: effectiveToken,
    type: "email",
  });

  if (error || !data.user) {
    redirect(
      `/login?step=sent&error=${encodeURIComponent(error?.message ?? "That code is invalid or has expired")}${backQuery}`,
    );
  }

  const { redirectPath, cookies: loginCookies } = await completeLogin({
    supabase,
    user: data.user,
    next,
  });

  const cookieStore = await cookies();
  for (const c of loginCookies) {
    cookieStore.set(c.name, c.value, c.options);
  }

  redirect(redirectPath);
}
