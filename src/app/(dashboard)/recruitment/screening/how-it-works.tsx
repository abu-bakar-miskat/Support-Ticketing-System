"use client"

import { useState } from "react"
import { Dialog } from "@base-ui/react/dialog"
import { CircleHelp, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const STEPS: { title: string; body: string }[] = [
  {
    title: "Send an invite",
    body:
      "Click “New screening invite”. Pick a candidate from your recruitment boards (name and email fill in automatically) or type them in. Set how many days the link stays valid, optionally preview and edit the email, then send. The candidate gets a personal link — you can also copy it and send it yourself.",
  },
  {
    title: "The candidate records",
    body:
      "They open the link on their own time and answer the questions on camera, one at a time, right in the browser — nothing to install. You can watch the Status column move from Sent to In progress to Awaiting scoring.",
  },
  {
    title: "The AI pre-scores",
    body:
      "After they submit, each answer is transcribed and scored 0–5 against the question's rubric, with flags for things like “no specifics” or “sounds scripted”. The queue sorts best-first. The AI only ranks — it never rejects anyone; content is scored, never accent or fluency.",
  },
  {
    title: "You review",
    body:
      "Click the candidate's name to watch their videos, read transcripts, and see per-answer scores and flags. Spoken English is yours to judge from the video. “Re-run scoring” fills in anything the AI missed.",
  },
  {
    title: "Mark it complete",
    body:
      "When you've made your call, use the ✓ on the row (or the button on the review page). The screening moves to the Completed tab — it doesn't disappear, and the tab shows who completed it and when. Reopen it any time with the ↺ button. Delete (🗑) is permanent and removes the recordings.",
  },
]

const NOTES = [
  "Managers only see invites they sent; admins see everything.",
  "“Edit questions” changes the question bank for future invites only — candidates already invited keep the questions they were sent.",
  "Videos are automatically deleted 90 days after upload; transcripts and scores stay.",
]

/** Manager-facing walkthrough of the screening flow, opened from the page header. */
export function HowItWorks() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CircleHelp />
        How it works
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop className="pen-overlay-backdrop fixed inset-0 z-50" />
        <Dialog.Popup className="border-pen-card-border bg-pen-bg fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(560px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border shadow-2xl">
          <div className="border-pen-card-border flex items-center justify-between border-b px-5 py-4">
            <Dialog.Title className="text-[14px] font-semibold">
              How video screening works
            </Dialog.Title>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-pen-muted hover:bg-pen-surface hover:text-pen-foreground rounded-md p-1"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-4 px-5 py-5">
            <ol className="space-y-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="bg-pen-surface border-pen-card-border mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold">{step.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-pen-card-border bg-pen-surface rounded-xl border px-4 py-3">
              <p className="text-[12.5px] font-semibold">Good to know</p>
              <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed">
                {NOTES.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
