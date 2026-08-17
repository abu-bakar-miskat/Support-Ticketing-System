'use client'

import { useAuthStore } from '@/store/use-auth-store'

export function useCurrentUser() {
  return useAuthStore((s) => s.user)
}
