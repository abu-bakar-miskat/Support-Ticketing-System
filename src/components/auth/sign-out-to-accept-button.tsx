"use client";

import { createClient } from "@/lib/supabase/client";

/** Sign out the wrong session, then hard-navigate to the invite login flow. */
export function SignOutToAcceptButton({
  invitedEmail,
  loginHref,
}: {
  invitedEmail: string;
  loginHref: string;
}) {
  async function onClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign(loginHref);
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="mt-5 inline-block rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
    >
      Sign out and continue as {invitedEmail}
    </button>
  );
}
