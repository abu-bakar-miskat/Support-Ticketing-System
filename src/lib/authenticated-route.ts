import "server-only";
import { requireAuth, type AuthProfile } from "@/lib/auth";
import { runAsSystem, runWithScope } from "@/lib/request-scope";
import { resolveProfileTicketScope, ticketScopeToRequestScope } from "@/lib/prisma-scope";

/**
 * Reusable App Router wrappers that establish the caller's authorization scope
 * ONCE at the request boundary and carry it via `AsyncLocalStorage` for the whole
 * handler.
 *
 * Why this exists: without an ambient scope, every tenant-scoped Prisma query in
 * a handler independently re-resolves the caller's scope (the
 * `TicketAccessGrant` + `TicketAssignee` + `RoleAssignment` trio), which
 * saturated the shared pooler and surfaced as `EMAXCONN`. `runWithScope` uses
 * `AsyncLocalStorage.run`, which — unlike `enterWith` inside React's cached
 * `getProfile` — reliably propagates across every await in the handler, so
 * `resolveTicketScope` takes the free ambient fast-path instead.
 *
 * This generalizes the hand-rolled pattern in `app/api/tickets/route.ts` so it
 * can be applied to any authenticated Route Handler.
 */

/** App Router route context. `params` is a Promise in this Next.js version. */
type RouteContext<P> = { params: Promise<P> };

type ScopedRouteHandler<P> = (
  profile: AuthProfile,
  request: Request,
  context: RouteContext<P>,
) => Response | Promise<Response>;

type RouteHandler<P> = (
  request: Request,
  context: RouteContext<P>,
) => Promise<Response>;

/**
 * Wrap an authenticated Route Handler: reject unauthenticated callers, resolve
 * the caller's ticket scope once, and run the handler under that ambient scope.
 * The resolved `profile` is passed as the handler's first argument so it need not
 * call `requireAuth`/`getProfile` again.
 *
 * ```ts
 * export const GET = withAuthenticatedScope<{ id: string }>(
 *   async (profile, request, { params }) => {
 *     const { id } = await params;
 *     // every scoped prisma query here uses the ambient scope — no re-resolution
 *     return NextResponse.json(await prisma.ticket.findMany({ where: { projectId: id } }));
 *   },
 * );
 * ```
 */
export function withAuthenticatedScope<P = Record<string, string>>(
  handler: ScopedRouteHandler<P>,
): RouteHandler<P> {
  return async (request, context) => {
    const { profile, error } = await requireAuth();
    if (error) return error;
    const scope = ticketScopeToRequestScope(await resolveProfileTicketScope(profile));
    return runWithScope(scope, () => handler(profile, request, context));
  };
}

/**
 * Wrap a trusted, unauthenticated Route Handler (webhook, cron, public intake)
 * so its whole body runs with tenant scoping disabled. This is the sole
 * sanctioned bypass — keep it to genuinely system-owned endpoints. Prefer
 * scoping the bypassed region as narrowly as the endpoint allows.
 */
export function withSystemScope<P = Record<string, string>>(
  handler: RouteHandler<P>,
): RouteHandler<P> {
  return (request, context) => runAsSystem(() => handler(request, context));
}
