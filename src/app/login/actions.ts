"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { completeLogin } from "@/lib/auth/complete-login";

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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
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
