"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * The queue is a server component, so candidate submissions and scoring runs
 * happening on other machines never reach an already-open tab. Re-fetch the
 * server payload on an interval and whenever the tab regains focus.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    const id = setInterval(refreshIfVisible, intervalMs)
    document.addEventListener("visibilitychange", refreshIfVisible)
    window.addEventListener("focus", refreshIfVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", refreshIfVisible)
      window.removeEventListener("focus", refreshIfVisible)
    }
  }, [router, intervalMs])

  return null
}
