type ProfileLike = {
  id: string;
  role: string;
  subDepartmentId?: string | null;
  subDepartmentIds?: string[];
  memberships?: { subDepartmentId: string; role: string }[];
  grantedAccessDeptIds?: string[];
  fullAccessGrantedDeptIds?: string[];
  directMemberDeptIds?: string[];
  managedDepartmentIds?: string[];
};

type TicketLike = {
  assigneeId?: string | null;
  creatorId?: string | null;
  coAssigneeIds?: string[];
  subDepartmentId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  /** Set by callers that already resolved project membership (avoids async in sync helper). */
  viewerIsProjectMember?: boolean;
};

/** Profile role or team membership role is lead on the ticket's team. */
export function isLeadOnTicketSubDepartment(
  profile: ProfileLike,
  subDepartmentId: string | null | undefined,
): boolean {
  if (!subDepartmentId) return false;
  const memberships = profile.memberships ?? [];
  if (memberships.some((m) => m.subDepartmentId === subDepartmentId && m.role === "sub_manager")) {
    return true;
  }
  if (profile.role === "sub_manager") {
    const subDepartmentIds =
      profile.subDepartmentIds ?? (profile.subDepartmentId ? [profile.subDepartmentId] : []);
    return subDepartmentIds.includes(subDepartmentId);
  }
  return false;
}

/**
 * Admin/manager can edit any ticket; staff only if assignee, co-assignee, or
 * creator; team leads can edit any ticket on their team; a cross-access guest
 * with a full-access grant to the ticket's department can also edit; a
 * project-scoped cross-access guest can edit any ticket in their assigned
 * projects — full access covers everything except deleting (see canDeleteTicket).
 */
export function canEditTicket(
  profile: ProfileLike,
  ticket: TicketLike,
): boolean {
  if (profile.role === "admin" || profile.role === "manager") return true;
  if (ticket.assigneeId === profile.id) return true;
  if (ticket.creatorId === profile.id) return true;
  if (ticket.coAssigneeIds?.includes(profile.id)) return true;
  if (isLeadOnTicketSubDepartment(profile, ticket.subDepartmentId)) return true;
  if (
    ticket.departmentId &&
    profile.fullAccessGrantedDeptIds?.includes(ticket.departmentId)
  )
    return true;
  if (
    ticket.departmentId &&
    ticket.projectId &&
    ticket.viewerIsProjectMember &&
    isLimitedCrossAccessGuest(profile, ticket.departmentId)
  )
    return true;
  return false;
}

function isLimitedCrossAccessGuest(
  profile: ProfileLike,
  departmentId: string,
): boolean {
  const granted = profile.grantedAccessDeptIds ?? [];
  const direct = profile.directMemberDeptIds ?? [];
  const full = profile.fullAccessGrantedDeptIds ?? [];
  const hasGrant = granted.includes(departmentId) || direct.includes(departmentId);
  return hasGrant && !full.includes(departmentId);
}

/**
 * Description edits: ticket creator, primary/co assignees, or a manager of
 * the ticket's department.
 */
export function canEditTicketDescription(
  profile: ProfileLike,
  ticket: TicketLike,
): boolean {
  if (ticket.creatorId === profile.id) return true;
  if (ticket.assigneeId === profile.id) return true;
  if (ticket.coAssigneeIds?.includes(profile.id)) return true;
  if (
    ticket.departmentId &&
    profile.managedDepartmentIds?.includes(ticket.departmentId)
  ) {
    return true;
  }
  return false;
}

/** Same rules as {@link canEditTicket} — dates and other ticket fields share one policy. */
export function canEditTicketDates(
  profile: ProfileLike,
  ticket: TicketLike,
): boolean {
  return canEditTicket(profile, ticket);
}

/** Admin/manager can delete any ticket; staff/lead only tickets they created. */
export function canDeleteTicket(
  profile: ProfileLike,
  ticket: Pick<TicketLike, "creatorId">,
): boolean {
  if (profile.role === "admin" || profile.role === "manager") return true;
  return ticket.creatorId === profile.id;
}
