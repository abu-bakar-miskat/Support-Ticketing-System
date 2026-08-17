"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Link2, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

/** Row actions for the screening queue. Delete is permanent and confirmed. */
export function RowActions({
  sessionId,
  candidateName,
  completed,
  screenToken,
}: {
  sessionId: string
  candidateName: string
  completed: boolean
  /** Present only while the candidate can still use the link (not submitted). */
  screenToken?: string
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function setCompleted(value: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/screening/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Couldn't update the invite.")
      }
      toast.success(
        value
          ? `${candidateName} marked complete — moved to the Completed tab`
          : `${candidateName} reopened — back in the active queue`,
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the invite.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {screenToken && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Copy the candidate's screening link"
          onClick={() => {
            navigator.clipboard
              .writeText(`${window.location.origin}/screen/${screenToken}`)
              .then(() => toast.success(`${candidateName}'s screening link copied`))
              .catch(() => toast.error("Couldn't copy the link"))
          }}
        >
          <Link2 className="text-muted-foreground" />
        </Button>
      )}
      {completed ? (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Reopen — move back to the active queue"
          disabled={busy}
          onClick={() => void setCompleted(false)}
        >
          <RotateCcw className="text-muted-foreground" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Mark complete — review finished, move to the Completed tab"
          disabled={busy}
          onClick={() => void setCompleted(true)}
        >
          <CheckCircle2 className="text-muted-foreground" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        title="Delete this invite permanently"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="text-muted-foreground" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete screening invite"
        description={`${candidateName}'s recordings, transcripts and scores are removed permanently, and their link stops working.`}
        confirmLabel="Delete invite"
        successMessage="Screening invite deleted"
        onConfirm={async () => {
          const res = await fetch(`/api/screening/session/${sessionId}`, { method: "DELETE" })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.error || "Couldn't delete the invite.")
          }
          router.refresh()
        }}
      />
    </>
  )
}
