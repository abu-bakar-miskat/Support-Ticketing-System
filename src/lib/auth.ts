import { getProfile, type ProfileMembership } from "@/lib/profile";
import { NextResponse } from "next/server";
import { forbidden, unauthorized } from "@/lib/api-response";
import { getProfileDeptScope, projectInScope, type DeptScope } from "@/lib/dept-scope";
import { canEditTicket } from "@/lib/ticket-date-permissions";
import { buildTicketEditContext, resolveTicketDeptId } from "@/lib/cross-access";
import { hasTenantAccess } from "@/lib/tenant-scope";
import { prisma } from "@/lib/db";

export type AuthProfile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

export async function requireAuth() {
  const profile = await getProfile();
  if (!profile) {
    return { profile: null, error: unauthorized() };
  }
  return { profile, error: null };
}

export async function requireAdmin(message = "Only admins can do this.") {
  const profile = await getProfile();
  if (!profile) {
    return { profile: null, error: unauthorized() };
  }
  if (profile.role !== "admin") {
    return { profile: null, error: forbidden(message) };
  }
  return { profile, error: null };
}

export async function requireAdminOrManager(
  message = "Only admins and managers can do this.",
) {
  const profile = await getProfile();
  if (!profile) {
    return { profile: null, isAdmin: false, error: unauthorized() };
  }
  if (profile.role !== "admin" && profile.role !== "manager") {
    return { profile: null, isAdmin: false, error: forbidden(message) };
  }
  return { profile, isAdmin: profile.role === "admin", error: null };
}

/** Platform super-admin gate (all-tenant control). */
export async function requireSuperAdmin(
  message = "Only super-admins can do this.",
) {
  const profile = await getProfile();
  if (!profile) {
    return { profile: null, error: unauthorized() };
  }
  if (!profile.isSuperAdmin) {
    return { profile: null, error: forbidden(message) };
  }
  return { profile, error: null };
}

/**
 * NextResponse error when the caller may not act within `tenantId`, else null.
 * The outermost gate: call before any tenant-scoped data access. Members and
 * super-admins pass; everyone else is rejected.
 */
export function assertTenantAccess(
  profile: AuthProfile,
  tenantId: string,
): NextResponse | null {
  if (hasTenantAccess(profile, tenantId)) return null;
  return forbidden("You don't have access to this tenant.");
}

/**
 * Resolves the viewer's currently-active department id (cookie-driven for
 * admins, managed/member dept for managers). Recruitment is scoped to this dept.
 */
export async function resolveActiveDeptId(
  profile: AuthProfile,
): Promise<string | null> {
  const scope = await getProfileDeptScope(profile);
  return scope?.activeDeptId ?? null;
}

/**
 * Prisma where-fragment scoping recruitment boards to the viewer. Boards are
 * scoped to the active department for everyone; managers are additionally
 * limited to boards they created. A null active department matches nothing.
 * Spread into board queries, or pass as a `board:` relation filter.
 */
export function recruitmentBoardWhere(
  profile: Pick<AuthProfile, "id" | "role">,
  activeDeptId: string | null,
): {
  departmentId: string;
  createdById?: string;
} {
  // Sentinel so "no active department" fails safe (no board carries this id).
  const departmentId = activeDeptId ?? "__no_active_department__";
  return profile.role === "admin"
    ? { departmentId }
    : { departmentId, createdById: profile.id };
}

/**
 * Same visibility rule for screening sessions: managers see only invites they
 * sent; admins see all. Spread into ScreeningSession queries.
 */
export function screeningSessionWhere(profile: Pick<AuthProfile, "id" | "role">): {
  createdById?: string;
} {
  return profile.role === "admin" ? {} : { createdById: profile.id };
}

/** Department IDs the user natively belongs to or manages (not cross-access grants). */
export function getNativeDepartmentIds(profile: AuthProfile): Set<string> {
  const managedIds: string[] = profile.managedDepartmentIds ?? [];
  const directMemberIds: string[] = profile.directMemberDeptIds ?? [];
  const memberDeptIds = (profile.memberships ?? [])
    .map((m: ProfileMembership) => m.subDepartment.department?.id)
    .filter((id: string | null | undefined): id is string => !!id);
  return new Set([...managedIds, ...memberDeptIds, ...directMemberIds]);
}

/**
 * True when the active department is one the user reaches via a DepartmentAccess
 * grant rather than team membership, direct membership, or management.
 * Full-access grants still count as cross-access for UI indicators.
 */
export function checkIsCrossAccessDept(
  profile: AuthProfile,
  activeDeptId: string | null,
): boolean {
  if (profile.role === "admin" || !activeDeptId) return false;
  const granted: string[] = profile.grantedAccessDeptIds ?? [];
  if (!granted.includes(activeDeptId)) return false;
  return !getNativeDepartmentIds(profile).has(activeDeptId);
}

/** Returns the set of department IDs a manager is allowed to act on. Admins get null (unrestricted). */
export function managerDeptScope(profile: AuthProfile): Set<string> | null {
  if (profile.role === "admin") return null;
  const managed: string[] = (profile as any).managedDepartmentIds ?? [];
  const granted: string[] = (profile as any).grantedAccessDeptIds ?? [];
  return new Set([...managed, ...granted]);
}

// ─── Ticket-level authorization ──────────────────────────────────────────────
// No RLS in this app — every ticket-scoped route must enforce access here.
// Policy: admins and managers see everything; otherwise the caller must be
// the assignee, the creator, or on the ticket's team.

type TicketAccessFields = {
  subDepartmentId: string;
  assigneeId: string | null;
  creatorId: string;
  deletedAt: Date | null;
  projectId?: string | null;
  /** Denormalized tenant of the ticket. Select it so the tenant gate can fire. */
  tenantId?: string | null;
  /** When true, only the creator (and admins via normal dept scope) may access. */
  isDraft?: boolean;
  subDepartment?: { departmentId?: string | null } | null;
  assignees?: ({ userId: string } | { user: { id: string } })[];
};

/**
 * The outermost ticket gate: a ticket outside the caller's active tenant is
 * invisible, before any draft/participant/manager/dept rule — even to direct
 * participants, and even to super-admins (who switch tenants to act). Only
 * applies when both sides carry a tenant; a missing tenant (unseeded env, or a
 * caller that didn't select tenantId) skips the gate rather than failing open
 * loudly — list-level tenant filters (see dept-scope) remain the backstop.
 */
function ticketOutsideActiveTenant(
  profile: AuthProfile,
  ticket: TicketAccessFields,
): boolean {
  const active = profile.activeTenantId;
  if (!active || !ticket.tenantId) return false;
  return ticket.tenantId !== active;
}

function getCoAssigneeIds(
  assignees: TicketAccessFields["assignees"],
): string[] {
  if (!assignees) return [];
  return assignees.map((a) => ("userId" in a ? a.userId : a.user.id));
}

function isDirectTicketParticipant(
  profile: AuthProfile,
  ticket: TicketAccessFields,
): boolean {
  if (ticket.assigneeId === profile.id || ticket.creatorId === profile.id) {
    return true;
  }
  return (
    ticket.assignees?.some((a) => {
      if ("userId" in a) return a.userId === profile.id;
      if ("user" in a) return a.user.id === profile.id;
      return false;
    }) ?? false
  );
}

export function canAccessTicket(
  profile: AuthProfile,
  ticket: TicketAccessFields,
  deptScope?: DeptScope,
): boolean {
  // Tenant is the outermost boundary — reject cross-tenant tickets before any
  // other rule, including direct participation.
  if (ticketOutsideActiveTenant(profile, ticket)) return false;

  // Drafts are personal: creator always; admins only within active dept scope
  // (or unrestricted when no dept cookie). Managers/peers/assignees never.
  if (ticket.isDraft) {
    if (ticket.creatorId === profile.id) return true;
    if (profile.role !== "admin") return false;
    if (deptScope && !deptScope.subDepartmentIds.includes(ticket.subDepartmentId)) return false;
    return true;
  }

  // Assignees, creators, and co-assignees can open their tickets even when
  // the ticket's team sits outside the active department workspace.
  if (isDirectTicketParticipant(profile, ticket)) return true;

  // A native relationship to the ticket grants access regardless of which
  // department is *currently active*. The active-dept cookie only scopes lists;
  // it must not deny a staff/lead who belongs to the ticket's team, or a manager
  // of its department, from opening a ticket (e.g. via a notification) while
  // they happen to be viewing a different department.
  const nativeSubDepartmentIds: string[] =
    (profile.subDepartmentIds as string[] | undefined) ??
    (profile.subDepartmentId ? [profile.subDepartmentId] : []);
  if (nativeSubDepartmentIds.includes(ticket.subDepartmentId)) return true;
  if (profile.role === "manager") {
    const deptId = ticket.subDepartment?.departmentId;
    const managedIds: string[] = (profile as any).managedDepartmentIds ?? [];
    // Only full (or managed) access grants blanket cross-dept ticket visibility.
    // Limited/project-scoped grants must prove project membership (handled by
    // assertTicketAccess's project-scope fallback).
    const fullAccessIds: string[] = (profile as any).fullAccessGrantedDeptIds ?? [];
    if (deptId && (managedIds.includes(deptId) || fullAccessIds.includes(deptId))) {
      return true;
    }
  }

  // Active department workspace — hard boundary for every role (including admin)
  if (deptScope && !deptScope.subDepartmentIds.includes(ticket.subDepartmentId)) {
    return false;
  }

  if (profile.role === "admin") return true;

  if (profile.role === "manager") {
    const deptId = ticket.subDepartment?.departmentId;
    const managedIds: string[] = (profile as any).managedDepartmentIds ?? [];
    // Limited/project-scoped cross-access is intentionally excluded here — those
    // managers only reach a ticket when they're a member of its project, which
    // assertTicketAccess verifies via its project-scope fallback.
    const fullAccessIds: string[] = (profile as any).fullAccessGrantedDeptIds ?? [];
    const allowedDepts = new Set([...managedIds, ...fullAccessIds]);

    if (allowedDepts.size > 0) {
      // Manager has managed/granted depts — enforce dept-based access
      if (deptId) return allowedDepts.has(deptId);
      // Ticket's team has no dept — check direct team membership as fallback
      const subDepartmentIds: string[] =
        (profile.subDepartmentIds as string[] | undefined) ??
        (profile.subDepartmentId ? [profile.subDepartmentId] : []);
      return subDepartmentIds.some((id) => id === ticket.subDepartmentId);
    }
    // Manager with no managed depts (edge case) — check team membership
    const subDepartmentIds: string[] =
      (profile.subDepartmentIds as string[] | undefined) ??
      (profile.subDepartmentId ? [profile.subDepartmentId] : []);
    return subDepartmentIds.some((id) => id === ticket.subDepartmentId);
  }

  const subDepartmentIds: string[] =
    (profile.subDepartmentIds as string[] | undefined) ??
    (profile.subDepartmentId ? [profile.subDepartmentId] : []);
  return subDepartmentIds.some((id) => id === ticket.subDepartmentId);
}

/**
 * Returns a NextResponse error when the caller may not act on the ticket,
 * or null when access is allowed. `forWrite` additionally rejects
 * soft-deleted tickets.
 */
export async function assertTicketAccess(
  profile: AuthProfile,
  ticket: TicketAccessFields,
  { forWrite = false }: { forWrite?: boolean } = {},
): Promise<NextResponse | null> {
  // Tenant gate first — no project/full-access fallback below may re-admit a
  // ticket from another tenant.
  if (ticketOutsideActiveTenant(profile, ticket)) {
    return forbidden("You don't have access to this ticket.");
  }

  // Drafts must not leak through project-membership fallbacks to managers/peers.
  if (
    ticket.isDraft &&
    ticket.creatorId !== profile.id &&
    profile.role !== "admin"
  ) {
    return forbidden("You don't have access to this draft.");
  }

  const deptScope = await getProfileDeptScope(profile);
  if (!canAccessTicket(profile, ticket, deptScope)) {
    // Admins may still open a draft via project/dept fallbacks below; others already returned.
    if (ticket.isDraft && profile.role !== "admin") {
      return forbidden("You don't have access to this draft.");
    }
    const deptId = await resolveTicketDeptId(ticket);
    const activeDeptId = deptScope?.activeDeptId ?? null;
    const fullAccess = profile.fullAccessGrantedDeptIds ?? [];

    const allowedViaProject =
      ticket.projectId != null &&
      (await projectInScope(profile, ticket.projectId));
    const allowedViaFullAccess =
      deptId != null &&
      activeDeptId === deptId &&
      fullAccess.includes(deptId);

    if (!allowedViaProject && !allowedViaFullAccess) {
      return forbidden("You don't have access to this ticket.");
    }
  }
  if (forWrite && ticket.deletedAt !== null) {
    return NextResponse.json(
      { error: "Ticket has been deleted" },
      { status: 409 },
    );
  }
  return null;
}

type TicketEditFields = TicketAccessFields;

/**
 * Like assertTicketAccess, but staff may only mutate tickets they assigned,
 * co-assigned, or created; team leads may edit any ticket on their team.
 * Admins and managers are unrestricted.
 */
export async function assertTicketEditAccess(
  profile: AuthProfile,
  ticket: TicketEditFields,
): Promise<NextResponse | null> {
  const accessError = await assertTicketAccess(profile, ticket, { forWrite: true });
  if (accessError) return accessError;

  if (!canEditTicket(profile, await buildTicketEditContext(profile, ticket))) {
    return forbidden(
      "You can only edit tickets you are assigned to, co-assigned to, created, or lead the team for.",
    );
  }
  return null;
}
