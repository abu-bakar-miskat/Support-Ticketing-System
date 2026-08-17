"use client"

import { useEffect, useRef, useTransition } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { createTicketsSubscription } from "@/lib/realtime"
import { invalidateTaskCaches } from "@/hooks/queries/invalidate-task-caches"

/** Debounce RSC refreshes when many ticket rows change in quick succession. */
const ROUTER_REFRESH_DEBOUNCE_MS = 200

/** Routes that hydrate primarily from RSC and need refresh on ticket WAL events. */
function routeNeedsRscRefresh(pathname: string): boolean {
  if (pathname === "/board" || pathname === "/timeline" || pathname === "/manager") return true
  if (pathname === "/inbox") return true
  if (pathname === "/projects") return true
  if (pathname === "/modules") return true
  return false
}

/** Ticket detail uses live state + activity broadcast — skip broad cache invalidation on WAL. */
function isTicketDetailPage(pathname: string): boolean {
  return /^\/tasks\/[^/]+$/.test(pathname)
}

export function useTicketsRealtime() {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const queryClientRef = useRef(queryClient)
  const pathnameRef = useRef(pathname)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    queryClientRef.current = queryClient
  })

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const supabase = createClient()

    function onTicketChange() {
      // Detail page patches via DATE_CHANGED broadcast — avoid refetching layout/lists
      if (!isTicketDetailPage(pathnameRef.current)) {
        invalidateTaskCaches(queryClientRef.current)
      }

      if (!routeNeedsRscRefresh(pathnameRef.current)) return

      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        startTransition(() => router.refresh())
      }, ROUTER_REFRESH_DEBOUNCE_MS)
    }

    const unsubscribe = createTicketsSubscription(supabase, onTicketChange)

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      unsubscribe()
    }
  }, [router])
}
