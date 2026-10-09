"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { ListSearchInput, SortDropdown } from "@/components/ui/list-controls"
import { useDebounce } from "@/hooks/use-debounce"

// Keep ids in sync with SORT_ORDER in page.tsx.
const SCREENING_SORTS = [
  { id: "default", label: "Default order" },
  { id: "score", label: "Highest score" },
  { id: "newest", label: "Newest invite" },
  { id: "oldest", label: "Oldest invite" },
  { id: "name", label: "Name (A–Z)" },
] as const

/**
 * Search box + sort for the screening queue. State lives in the URL (?q=, ?sort=)
 * so the server component can query and paginate; any change resets to page 1.
 */
export function QueueControls({ view, q, sort }: { view?: string; q: string; sort: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(q)
  const debounced = useDebounce(query, 350)
  const lastPushed = useRef(q)

  function navigate(next: { q: string; sort: string }) {
    const params = new URLSearchParams()
    if (view) params.set("view", view)
    if (next.q.trim()) params.set("q", next.q.trim())
    if (next.sort && next.sort !== "default") params.set("sort", next.sort)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  useEffect(() => {
    if (debounced.trim() === lastPushed.current.trim()) return
    lastPushed.current = debounced
    navigate({ q: debounced, sort })
    // navigate is recreated each render; only react to the debounced query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return (
    <div className="flex items-center gap-2">
      {pending && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
      <ListSearchInput value={query} onChange={setQuery} placeholder="Search candidates…" />
      <SortDropdown
        value={sort}
        onChange={(v) => navigate({ q: query, sort: v })}
        options={[...SCREENING_SORTS]}
      />
    </div>
  )
}
