"use server";

import { redirect } from "next/navigation";
import { sendLoginCode } from "@/lib/auth/send-login-code";
import { isDevTestAccount } from "@/lib/auth/dev-test-accounts";
import { safeNextPath } from "@/lib/auth-redirect";

/**
 * Send an invitee their one-time sign-in code, then land on the code-entry step.
 *
 * This is invoked ONLY from an explicit "Accept invitation" button click on the
 * invite pages — never during the page's GET render. Sending the OTP is a
 * state-changing action, so it must not be a side effect of a GET: mail-security
 * scanners and link prefetchers (Outlook SafeLinks, Mimecast, Gmail proxy)
 * fetch the invite URL automatically the moment the email lands, which would
 * otherwise fire an OTP before the human ever clicks — leaving the invitee with
 * a stray sign-in code instead of (or on top of) their invitation.
 */
export async function sendInviteLoginCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const nextQuery = next !== "/" ? `&next=${encodeURIComponent(next)}` : "";

  if (!email) {
    redirect(`/login?error=${encodeURIComponent("Enter your email address")}${nextQuery}`);
  }

  // Fixed test accounts sign in with the bypass code, so there's no real code to
  // email — jump straight to code entry (mirrors the login page's handling).
  if (isDevTestAccount(email)) {
    redirect(
      `/login?step=sent&email=${encodeURIComponent(email)}&verificationType=magiclink&t=${Date.now()}${nextQuery}`,
    );
  }

  // A "please wait" resend-cooldown error means a code was already sent moments
  // ago (e.g. a double click) — treat that as success rather than an error.
  const result = await sendLoginCode(email);
  if (result.error && !result.error.startsWith("Please wait")) {
    redirect(`/login?error=${encodeURIComponent(result.error)}${nextQuery}`);
  }
  redirect(
    `/login?step=sent&email=${encodeURIComponent(email)}&verificationType=${result.verificationType ?? "magiclink"}&t=${Date.now()}${nextQuery}`,
  );
}
