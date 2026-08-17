"use client"

import { useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Root error boundary. The most common production error here is a stale tab
 * requesting chunks from a previous deploy — for that case, reload once
 * automatically (fresh assets fix it); the guard stops a reload loop if the
 * error is something else that persists across reloads.
 */
const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk|CSS chunk|Failed to fetch dynamically imported|dynamically imported module|Importing a module script failed/i

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (CHUNK_ERROR.test(error.message) && !sessionStorage.getItem("pen-chunk-reloaded")) {
      sessionStorage.setItem("pen-chunk-reloaded", "1")
      window.location.reload()
    }
  }, [error])

  // Clear the guard once a page load succeeds again.
  useEffect(() => {
    const t = setTimeout(() => sessionStorage.removeItem("pen-chunk-reloaded"), 10_000)
    return () => clearTimeout(t)
  }, [])

  const isStale = CHUNK_ERROR.test(error.message)

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <RefreshCw className="text-muted-foreground h-8 w-8" strokeWidth={1.5} />
      <h1 className="text-xl font-semibold">
        {isStale ? "The app was updated" : "Something went wrong"}
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        {isStale
          ? "A new version was deployed while this tab was open. Refresh to load it."
          : "An unexpected error occurred. Refreshing usually fixes it — if it keeps happening, let the team know."}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>
          <RefreshCw />
          Refresh
        </Button>
        {!isStale && (
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
