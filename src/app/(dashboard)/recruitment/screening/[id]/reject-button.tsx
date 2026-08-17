"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Dialog } from "@base-ui/react/dialog"
import { Loader2, Mail, UserX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[12.5px] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

/**
 * Rejects the candidate from the review page by writing the linked board
 * candidate's stage column (e.g. Stage → "Screening Rejected") — the decision
 * syncs straight to the recruitment table — and optionally sends the candidate
 * a rejection email whose feedback is AI-drafted from the screening
 * assessments (editable before it goes out; sent from onboarding@ with the
 * reviewer's name and reply-to, like the invite). Only rendered when the
 * session is linked to a candidate whose board has a reject-able stage. Undo
 * the rejection on the board itself by changing the stage value there.
 */
export function RejectButton({
  sessionId,
  rejected,
  stageLabel,
  reasonOptions,
  candidateEmail,
}: {
  sessionId: string
  rejected: boolean
  stageLabel: string
  reasonOptions: { id: string; label: string }[]
  candidateEmail: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<"confirm" | "email">("confirm")
  const [busy, setBusy] = useState(false)
  const [reasonId, setReasonId] = useState("")
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [subject, setSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")

  function openDialog(initialStage: "confirm" | "email") {
    setStage(initialStage)
    setOpen(true)
    if (initialStage === "email") void loadDraft()
  }

  async function loadDraft() {
    setDrafting(true)
    try {
      const res = await fetch(`/api/screening/session/${sessionId}/reject-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Couldn't draft the email.")
      setSubject(data.subject)
      setEmailBody(data.body)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't draft the email.")
      setSubject("")
      setEmailBody("")
    } finally {
      setDrafting(false)
    }
  }

  async function reject(withEmail: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/screening/session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reject: true, reasonOptionId: reasonId || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Couldn't reject the candidate.")
      }
      toast.success(`Rejected — stage set to “${stageLabel}” on the board`)
      router.refresh()
      if (withEmail) {
        setStage("email")
        void loadDraft()
      } else {
        setOpen(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reject the candidate.")
    } finally {
      setBusy(false)
    }
  }

  async function sendEmail() {
    setSending(true)
    try {
      const res = await fetch(`/api/screening/session/${sessionId}/reject-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", subject, body: emailBody }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Couldn't send the email.")
      toast.success(`Rejection email sent to ${candidateEmail}`)
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the email.")
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {rejected ? (
        <>
          <span className="bg-destructive/15 text-destructive inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium">
            <UserX className="size-4" />
            Rejected
          </span>
          <Button variant="outline" size="sm" onClick={() => openDialog("email")}>
            <Mail />
            Reject email
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => openDialog("confirm")}
        >
          <UserX />
          Reject
        </Button>
      )}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="pen-overlay-backdrop fixed inset-0 z-50" />
          <Dialog.Popup className="border-pen-card-border bg-pen-bg fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border shadow-2xl">
            <div className="border-pen-card-border flex items-center justify-between border-b px-5 py-4">
              <Dialog.Title className="text-[14px] font-semibold">
                {stage === "confirm" ? "Reject candidate" : "Rejection email"}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {stage === "confirm" ? (
              <div className="space-y-4 px-5 py-4">
                <p className="text-muted-foreground text-sm">
                  This sets the candidate&apos;s stage to{" "}
                  <span className="text-foreground font-medium">“{stageLabel}”</span> on the
                  recruitment board and files this screening under Completed. You can undo it by
                  changing the stage on the board.
                </p>
                {reasonOptions.length > 0 && (
                  <div>
                    <div className="pen-text-section-label mb-1.5">Reject reason (optional)</div>
                    <Select value={reasonId || null} onValueChange={(v) => setReasonId(typeof v === "string" ? v : "")}>
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue placeholder="Pick a reason…" />
                      </SelectTrigger>
                      <SelectContent>
                        {reasonOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reject(false)} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <UserX />}
                    Reject only
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => reject(true)} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Mail />}
                    Reject &amp; draft email
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 px-5 py-4">
                {drafting ? (
                  <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Drafting a feedback email from the screening…
                  </div>
                ) : (
                  <>
                    <p className="text-muted-foreground text-xs">
                      To <span className="text-foreground font-medium">{candidateEmail}</span> — the
                      draft pulls constructive feedback from the screening assessments. Edit
                      anything before sending; it goes out under your name with replies to your
                      inbox.
                    </p>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Email subject"
                      className="font-medium"
                    />
                    <textarea
                      className={TEXTAREA}
                      rows={14}
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <Button size="sm" variant="link" onClick={() => void loadDraft()} disabled={sending}>
                        Redraft
                      </Button>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
                          Don&apos;t send
                        </Button>
                        <Button
                          size="sm"
                          onClick={sendEmail}
                          disabled={sending || !subject.trim() || !emailBody.trim()}
                        >
                          {sending ? <Loader2 className="animate-spin" /> : <Mail />}
                          Send email
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
