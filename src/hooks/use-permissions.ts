'use client'

import { useMemo } from 'react'
import { useAuthStore } from '@/store/use-auth-store'
import {
  canDeleteProjects,
  canManageProjectBoards,
  canManageProjectLifecycle,
  canManageProjects,
  isProjectLead,
  type ProjectPermissionProfile,
} from '@/lib/project-permissions'

export type Permissions = {
  /** No signed-in user in the store yet. */
  loading: boolean
  isAdmin: boolean
  isManager: boolean
  isLead: boolean
  isAdminOrManager: boolean
  canManageProjects: boolean
  canManageProjectLifecycle: boolean
  canManageProjectBoards: boolean
  canDeleteProjects: boolean
}

const EMPTY: Permissions = {
  loading: true,
  isAdmin: false,
  isManager: false,
  isLead: false,
  isAdminOrManager: false,
  canManageProjects: false,
  canManageProjectLifecycle: false,
  canManageProjectBoards: false,
  canDeleteProjects: false,
}

/**
 * Client-side mirror of the server permission helpers, derived from the auth
 * store. Use to hide or disable actions the current user can't perform. The
 * server still enforces access — this is for UX, not security.
 */
export function usePermissions(): Permissions {
  const user = useAuthStore((s) => s.user)

  return useMemo(() => {
    if (!user) return EMPTY
    const profile: ProjectPermissionProfile = {
      role: user.role,
      subDepartmentId: user.subDepartmentId,
      subDepartmentIds: user.subDepartmentIds,
      memberships: user.memberships,
    }
    return {
      loading: false,
      isAdmin: user.role === 'admin',
      isManager: user.role === 'manager',
      isLead: isProjectLead(profile),
      isAdminOrManager: user.role === 'admin' || user.role === 'manager',
      canManageProjects: canManageProjects(profile),
      canManageProjectLifecycle: canManageProjectLifecycle(profile),
      canManageProjectBoards: canManageProjectBoards(profile),
      canDeleteProjects: canDeleteProjects(profile),
    }
  }, [user])
}
