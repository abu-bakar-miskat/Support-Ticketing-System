"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Flag, FlagOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Reviewer integrity flag — records a human's video-review verdict (reading
 * answers off-screen, someone else answering, etc.) that the transcript-only
 * AI scorer cannot make. Shows as a red marker in the queue; never changes
 * the content score.
 */
export function FlagButton({
  sessionId,
  flagged,
}: {
  sessionId: string
  flagged: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState("")

  async function submit(nextFlagged: boolean, nextNote?: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/screening/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: nextFlagged, note: nextNote }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Couldn't update the flag.")
      }
      toast.success(nextFlagged ? "Integrity flag set" : "Integrity flag removed")
      setEditing(false)
      setNote("")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the flag.")
    } finally {
      setBusy(false)
    }
  }

  if (flagged) {
    return (
      <Button variant="outline" size="sm" onClick={() => submit(false)} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <FlagOff />}
        Remove flag
      </Button>
    )
  }

  if (!editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => setEditing(true)} disabled={busy}>
        <Flag />
        Flag integrity
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you see? e.g. reading answers off-screen"
        className="h-8 w-72 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(true, note)
          if (e.key === "Escape") setEditing(false)
        }}
      />
      <Button size="sm" onClick={() => submit(true, note)} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : "Flag"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
        Cancel
      </Button>
    </div>
  )
}
