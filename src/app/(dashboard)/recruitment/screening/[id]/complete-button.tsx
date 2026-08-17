"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Reviewer sign-off from the review page — mirrors the queue's row action. */
export function CompleteButton({
  sessionId,
  completed,
}: {
  sessionId: string
  completed: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const res = await fetch(`/api/screening/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Couldn't update the invite.")
      }
      toast.success(
        completed ? "Reopened — back in the active queue" : "Marked complete — moved to the Completed tab",
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the invite.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant={completed ? "outline" : "default"} size="sm" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : completed ? <RotateCcw /> : <CheckCircle2 />}
      {completed ? "Reopen" : "Mark complete"}
    </Button>
  )
}
