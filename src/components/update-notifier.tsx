"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

/**
 * Detects that a new deploy went live while this tab was open and shows a
 * persistent "refresh" toast — instead of letting the next navigation 404 on
 * chunks that no longer exist and dead-end on the browser error page.
 */
export function UpdateNotifier({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const baselineRef = useRef<string | null>(null)
  const notifiedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (notifiedRef.current || document.visibilityState !== "visible") return
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok) return
        const { build } = (await res.json()) as { build?: string }
        if (!build || cancelled) return
        if (baselineRef.current === null) {
          baselineRef.current = build
          return
        }
        if (build !== baselineRef.current) {
          notifiedRef.current = true
          // Nudge the service worker so the refresh picks up fresh assets too.
          navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {})
          toast.info("The app was updated", {
            id: "app-updated",
            duration: Infinity,
            description: "Refresh to load the new version — unsaved form input will be lost.",
            action: { label: "Refresh", onClick: () => window.location.reload() },
          })
        }
      } catch {
        // Offline or mid-deploy blip — try again next tick.
      }
    }

    void check()
    const id = setInterval(check, intervalMs)
    document.addEventListener("visibilitychange", check)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener("visibilitychange", check)
    }
  }, [intervalMs])

  return null
}
