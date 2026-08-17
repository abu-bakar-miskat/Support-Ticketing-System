"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Re-runs the scoring job for a session (fills in anything scoring missed). */
export function RescoreButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch("/api/screening/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Scoring failed.")
      if (data.failed?.length) {
        toast.warning(`Scored ${data.scored}, ${data.failed.length} failed — try again.`)
      } else {
        toast.success(`Scored ${data.scored}, skipped ${data.skipped}.`)
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scoring failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {busy ? "Scoring…" : "Re-run scoring"}
    </Button>
  )
}
