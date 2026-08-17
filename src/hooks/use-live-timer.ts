"use client"

import { useEffect, useState } from "react"

/** Returns live elapsed seconds since `startedAtMs`, ticking every second. Returns 0 when null. */
export function useLiveTimer(startedAtMs: number | null): number {
  const [secs, setSecs] = useState(
    () => (startedAtMs ? Math.floor((Date.now() - startedAtMs) / 1000) : 0),
  )

  useEffect(() => {
    if (!startedAtMs) {
      setSecs(0)
      return
    }
    setSecs(Math.floor((Date.now() - startedAtMs) / 1000))
    const id = setInterval(
      () => setSecs(Math.floor((Date.now() - startedAtMs) / 1000)),
      1000,
    )
    return () => clearInterval(id)
  }, [startedAtMs])

  return secs
}
