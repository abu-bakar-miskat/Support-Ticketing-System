"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * In-shell error boundary body. Rendered by segment-level `error.tsx` files so
 * a crashing page keeps the sidebar/top bar and the user can navigate away
 * instead of being dumped on a blank full-screen error.
 *
 * Mirrors the stale-deploy handling in `src/app/error.tsx`: chunk-load errors
 * reload once automatically.
 */
const CHUNK_ERROR =
  /ChunkLoadError|Loading chunk|CSS chunk|Failed to fetch dynamically imported|dynamically imported module|Importing a module script failed/i

export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const isStale = CHUNK_ERROR.test(error.message)

  useEffect(() => {
    if (isStale && !sessionStorage.getItem("sts-chunk-reloaded")) {
      sessionStorage.setItem("sts-chunk-reloaded", "1")
      window.location.reload()
    } else if (!isStale) {
      console.error(error)
    }
  }, [error, isStale])

  return (
    <div
      role="alert"
      className="flex h-full min-h-[60vh] flex-col items-center justify-center px-6 py-16"
    >
      <div className="flex max-w-[440px] flex-col items-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-sts-surface">
          {isStale ? (
            <RefreshCw className="size-6 text-sts-muted" />
          ) : (
            <AlertTriangle className="size-6 text-sts-muted" />
          )}
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="sts-text-page-title">
            {isStale ? "The app was updated" : "This page couldn't load"}
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-sts-muted">
            {isStale
              ? "A new version was deployed while this tab was open. Refresh to load it."
              : "Something went wrong while showing this page. Try again — your other pages are still available from the sidebar."}
          </p>
          {error.digest && (
            <p className="font-mono text-[11px] text-sts-subtle">Error ID: {error.digest}</p>
          )}
        </div>
        <div className="flex gap-2">
          {isStale ? (
            <Button onClick={() => window.location.reload()}>
              <RefreshCw />
              Refresh
            </Button>
          ) : (
            <>
              <Button onClick={reset}>Try again</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw />
                Reload page
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
