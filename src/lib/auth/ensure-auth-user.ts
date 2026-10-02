import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Return the Supabase auth user id for `email`, creating a confirmed user when
 * none exists. Profile rows are keyed by this id, so a person invited before
 * their first sign-in still has an account the login OTP can attach to.
 * `email_confirm: true` marks the address confirmed and does not send mail.
 */
export async function ensureConfirmedAuthUser(
  email: string,
  name: string,
): Promise<{ id: string }> {
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });
  if (created.data?.user?.id) return { id: created.data.user.id };

  // Address already registered: resolve the existing auth user without creating
  // a second one. generateLink returns that user and does not deliver mail here
  // — login codes are sent separately.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const id = link.data?.user?.id;
  if (!id) {
    throw new Error(
      created.error?.message || link.error?.message || "Could not create an account for this email",
    );
  }
  return { id };
}
