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
      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sts-blue px-4 py-2.5 text-[14px] font-medium text-white hover:opacity-90"
    >
      Sign out and continue as {invitedEmail}
    </button>
  );
}
