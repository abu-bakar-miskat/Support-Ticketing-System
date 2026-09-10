import "server-only";

import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixed set of role-based test accounts for local/preview sign-in. Each logs in
 * with the shared dev bypass code (see DEV_BYPASS_CODE in login/actions.ts) — no
 * email is ever sent. These only work when the dev bypass is enabled, so they
 * never grant access in real production.
 */
type TestAccount = { role: Role; isSuperAdmin?: boolean };

const TEST_ACCOUNTS: Record<string, TestAccount> = {
  "agent@gmail.com": { role: "agent" },
  "submanager@gmail.com": { role: "sub_manager" },
  "manager@gmail.com": { role: "manager" },
  "admin@gmail.com": { role: "admin" },
  "superadmin@gmail.com": { role: "admin", isSuperAdmin: true },
};

export function isDevTestAccount(email: string): boolean {
  return Object.prototype.hasOwnProperty.call(TEST_ACCOUNTS, email.toLowerCase());
}

/**
 * Idempotently provision a test account so the dev bypass can log it in with the
 * correct role: ensure a confirmed Supabase auth user exists, then seed its
 * Profile and primary-tenant membership with the mapped role. Safe to call on
 * every bypass login — everything is an upsert.
 */
export async function ensureDevTestAccount(email: string): Promise<void> {
  const key = email.toLowerCase();
  const account = TEST_ACCOUNTS[key];
  if (!account) return;

  const admin = createAdminClient();

  // Create the auth user (idempotent: an existing address just errors, which we
  // ignore) and resolve its id either way so we can key the Profile off it.
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email: key,
    email_confirm: true,
  });
  if (created.data?.user) {
    userId = created.data.user.id;
  } else {
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: key });
    userId = link.data?.user?.id ?? undefined;
  }
  if (!userId) return;

  const name = key.split("@")[0];
  await prisma.profile.upsert({
    where: { id: userId },
    update: { role: account.role, isSuperAdmin: account.isSuperAdmin ?? false, deletedAt: null },
    create: {
      id: userId,
      email: key,
      name,
      role: account.role,
      isSuperAdmin: account.isSuperAdmin ?? false,
    },
  });

  const defaultTenant = await prisma.tenant.findUnique({ where: { slug: "pen" } });
  if (defaultTenant) {
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId: defaultTenant.id, userId } },
      update: { role: account.role, isActive: true },
      create: { tenantId: defaultTenant.id, userId, role: account.role, isActive: true },
    });
  }
}
