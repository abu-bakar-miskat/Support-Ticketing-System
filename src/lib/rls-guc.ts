import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/**
 * D-02/C-01: sets the per-request tenant/scope GUCs that the RLS policies
 * from the rls_hardening migration key on. Mirrors the existing
 * `set_config('app.current_user_id', ..., true)` pattern already used for
 * trigger context (see e.g. src/app/api/tickets/[id]/status/route.ts) —
 * `true` (is_local) means it's transaction-scoped, which is what survives a
 * transaction-mode pgbouncer connection.
 *
 * Inert today: the app connects as the `postgres` owner role, which bypasses
 * RLS regardless of these GUCs. This becomes load-bearing only once a
 * deliberate future cutover switches the connection to `app_rls_user`
 * (see the rls_hardening migration) — at which point every tenant-scoped
 * query needs to run through `withTenantGuc` (or an equivalent hookup in
 * lib/request-scope.ts) for RLS to see the right tenant.
 */
export async function withTenantGuc(
  tx: Prisma.TransactionClient,
  scope: { tenantId: string | null; isPlatformAdmin: boolean },
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${scope.tenantId ?? ""}, true)`;
  await tx.$executeRaw`SELECT set_config('app.is_platform_admin', ${scope.isPlatformAdmin ? "true" : "false"}, true)`;
}

/** Runs `fn` inside a transaction with the tenant/scope GUCs set for RLS. */
export function runWithTenantGuc<T>(
  prisma: { $transaction: <R>(fn: (tx: Prisma.TransactionClient) => Promise<R>) => Promise<R> },
  scope: { tenantId: string | null; isPlatformAdmin: boolean },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await withTenantGuc(tx, scope);
    return fn(tx);
  });
}
