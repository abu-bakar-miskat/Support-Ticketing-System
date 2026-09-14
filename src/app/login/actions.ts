"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { runVerifyOtp } from "@/lib/auth/verify-otp";

export type VerifyOtpResult = { redirectTo: string };

/**
 * Kept for any leftover callers. The login form POSTs `/api/auth/verify-otp`
 * instead — a server action's return is held until Next re-renders `/login`
 * with the new session, which is what left invitees stuck on "Verifying…".
 */
export async function verifyOtpCode(formData: FormData): Promise<VerifyOtpResult> {
  const supabase = await createClient();
  const { redirectTo, cookies: loginCookies } = await runVerifyOtp(supabase, {
    email: String(formData.get("email") ?? ""),
    token: String(formData.get("token") ?? ""),
    next: String(formData.get("next") ?? ""),
    verificationType: String(formData.get("verificationType") ?? ""),
  });
  const cookieStore = await cookies();
  for (const c of loginCookies) {
    cookieStore.set(c.name, c.value, c.options);
  }
  return { redirectTo };
}
