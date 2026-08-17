"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { cn } from "@/lib/utils"
import type { BankQuestion } from "@/lib/screening/question-bank"

const TEXTAREA =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-[12.5px] transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

type Draft = {
  prompt: string
  hint: string
  rubricFive: string
  rubricThree: string
  rubricOne: string
  rubricPenalise: string
}

const EMPTY_DRAFT: Draft = {
  prompt: "",
  hint: "",
  rubricFive: "",
  rubricThree: "",
  rubricOne: "",
  rubricPenalise: "",
}

function toDraft(q: BankQuestion): Draft {
  return {
    prompt: q.prompt,
    hint: q.hint,
    rubricFive: q.rubric.five,
    rubricThree: q.rubric.three,
    rubricOne: q.rubric.one,
    rubricPenalise: q.rubric.penalise,
  }
}

export function QuestionsEditor({ initialQuestions }: { initialQuestions: BankQuestion[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BankQuestion | null>(null)

  async function call(path: string, method: string, body?: unknown, silent = false) {
    setBusy(true)
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Something went wrong.")
      }
      setEditing(null)
      setAdding(false)
      router.refresh()
      return true
    } catch (err) {
      if (silent) throw err
      toast.error(err instanceof Error ? err.message : "Something went wrong.")
      return false
    } finally {
      setBusy(false)
    }
  }

  function editorFields() {
    const label = "pen-text-section-label mb-1 block"
    return (
      <div className="space-y-3">
        <div>
          <label className={label}>Question</label>
          <textarea
            className={TEXTAREA}
            rows={2}
            value={draft.prompt}
            onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Hint shown to the candidate</label>
          <Input value={draft.hint} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["rubricFive", "A 5 looks like…"],
              ["rubricThree", "A 3 looks like…"],
              ["rubricOne", "A 1 looks like…"],
              ["rubricPenalise", "Penalise"],
            ] as const
          ).map(([key, title]) => (
            <div key={key}>
              <label className={label}>{title}</label>
              <textarea
                className={TEXTAREA}
                rows={3}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {initialQuestions.map((q, i) => (
        <section
          key={q.id}
          className={cn(
            "pen-glass-panel border-border rounded-2xl border p-4",
            !q.active && "opacity-55",
          )}
        >
          {editing === q.id ? (
            <>
              {editorFields()}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => call(`/api/screening/questions/${q.id}`, "PATCH", draft)}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="pen-text-section-label">
                    Question {i + 1}
                    {!q.active && " · disabled"}
                    {q.alwaysInclude && " · in every invite"}
                  </div>
                  <p className="mt-1 font-medium">{q.prompt}</p>
                  {q.hint && <p className="text-muted-foreground mt-1 text-sm italic">{q.hint}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy || i === 0}
                    title="Move up"
                    onClick={() => call(`/api/screening/questions/${q.id}`, "PATCH", { move: "up" })}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy || i === initialQuestions.length - 1}
                    title="Move down"
                    onClick={() => call(`/api/screening/questions/${q.id}`, "PATCH", { move: "down" })}
                  >
                    <ArrowDown />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setDraft(toDraft(q))
                    setEditing(q.id)
                    setAdding(false)
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    call(`/api/screening/questions/${q.id}`, "PATCH", { active: !q.active })
                  }
                >
                  {q.active ? "Disable" : "Enable"}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  title="Pinned questions appear in every invite; the rest are drawn randomly per invite once the bank is bigger than one set."
                  onClick={() =>
                    call(`/api/screening/questions/${q.id}`, "PATCH", { alwaysInclude: !q.alwaysInclude })
                  }
                >
                  {q.alwaysInclude ? "Unpin" : "Pin to every invite"}
                </Button>
                <Button size="xs" variant="destructive" disabled={busy} onClick={() => setDeleteTarget(q)}>
                  Delete
                </Button>
              </div>
            </>
          )}
        </section>
      ))}

      {adding ? (
        <section className="pen-glass-panel border-border rounded-2xl border p-4">
          <div className="pen-text-section-label mb-3">New question</div>
          {editorFields()}
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => call("/api/screening/questions", "POST", draft)}>
              Add question
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : (
        <Button
          onClick={() => {
            setDraft(EMPTY_DRAFT)
            setAdding(true)
            setEditing(null)
          }}
        >
          Add a question
        </Button>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Delete question"
        description={
          deleteTarget
            ? `"${deleteTarget.prompt.slice(0, 80)}${deleteTarget.prompt.length > 80 ? "…" : ""}" — if it was ever asked in an invite it will be disabled instead of deleted, so past screenings keep their record.`
            : ""
        }
        confirmLabel="Delete question"
        successMessage="Question removed"
        onConfirm={async () => {
          if (!deleteTarget) return
          await call(`/api/screening/questions/${deleteTarget.id}`, "DELETE", undefined, true)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
