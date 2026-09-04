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
 * admin client) to mint a real magic-link OTP for the email, then redeem that
 * through Supabase so a genuine session is established.
 */
const DEV_BYPASS_CODE = "12345678";

/**
 * The bypass is enabled on any non-production build, OR when the explicit
 * `ALLOW_DEV_OTP_BYPASS=true` flag is set. The flag lets it work in a
 * production-mode build you run locally for testing (`next build && next start`,
 * a preview deploy…) where `NODE_ENV` is "production". It stays OFF by default in
 * real production because the flag is absent there — never set it in prod env.
 */
const isDevBypassEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.ALLOW_DEV_OTP_BYPASS === "true";

/**
 * Mint the email's real OTP via the service-role admin client so the fixed dev
 * code can be redeemed through the normal verifyOtp path. Returns the OTP, or an
 * error string explaining why it couldn't (missing service key, unknown user…).
 */
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
  const requestedType = String(formData.get("verificationType") ?? "");

  const backQuery =
    `&email=${encodeURIComponent(email)}` +
    `&verificationType=${requestedType === "signup" ? "signup" : "magiclink"}` +
    (next !== "/" ? `&next=${encodeURIComponent(next)}` : "");

  if (!email || token.length < 6) {
    redirect(
      `/login?step=sent&error=${encodeURIComponent("Enter the code from your email")}${backQuery}`,
    );
  }

  // Dev-only shortcut: the fixed code is swapped for a real magic-link OTP so
  // verification still goes through Supabase and yields a real session. The
  // generated credential must be redeemed using the verification type Supabase
  // returns. Existing confirmed users normally return `magiclink`; a newly
  // created or unconfirmed address can return `signup` instead.
  let effectiveToken = token;
  let verificationType: "signup" | "magiclink" =
    requestedType === "signup" ? "signup" : "magiclink";
  if (isDevBypassEnabled && token === DEV_BYPASS_CODE) {
    const result = await resolveDevBypassToken(email);
    if ("error" in result) {
      console.error("[verifyOtpCode] dev bypass:", result.error);
      redirect(
        `/login?step=sent&error=${encodeURIComponent(result.error)}${backQuery}`,
      );
    }
    effectiveToken = result.token;
    verificationType = result.verificationType;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: effectiveToken,
    type: verificationType,
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
