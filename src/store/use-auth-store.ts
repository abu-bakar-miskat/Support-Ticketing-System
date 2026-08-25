'use client'

import { create } from 'zustand'
import type { Role } from '@/generated/prisma/enums'

type CurrentUser = {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: Role
  subDepartmentId: string | null
  subDepartmentIds: string[]
  memberships: { subDepartmentId: string; role: string }[]
  isSuperAdmin?: boolean
}

type AuthState = {
  user: CurrentUser | null
  setUser: (user: CurrentUser | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
