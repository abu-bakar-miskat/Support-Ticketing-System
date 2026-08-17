'use client'

import { create } from 'zustand'
import type { Role } from '@/generated/prisma/enums'

type CurrentUser = {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  role: Role
  teamId: string | null
  teamIds: string[]
  memberships: { teamId: string; role: string }[]
}

type AuthState = {
  user: CurrentUser | null
  setUser: (user: CurrentUser | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
