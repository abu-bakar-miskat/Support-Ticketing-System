"use client"

import { useEffect, useMemo, useRef, useState, useId } from "react"
import { CheckCircle2, Loader2, Paperclip, Pencil, Send, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  buildScript,
  validateAnswer,
  questionFor,
  mentionsAttachment,
  type ChatField,
  type ChatIssue,
  type ChatStep,
} from "./intake-chat-script"
import { uploadIntakeFile } from "@/lib/api/upload-intake-file"

type Message = { id: number; role: "bot" | "user"; text: string }

type UploadState = {
  file: File
  uploading: boolean
  url: string | null
  error: string | null
}

const STEP_DELAY_MS = 400
const MAX_ATTACHMENTS = 5

type Attachment = { name: string; url: string }

function stepKey(step: ChatStep): string {
  if (step.kind === "field") return step.field.id
  if (step.kind === "childSelect") return `${step.field.id}:child`
  return step.kind
}

export function IntakeChat({
  formId,
  fields,
  issues,
}: {
  formId: string
  fields: ChatField[]
  issues: ChatIssue[]
}) {
  const script = useMemo(() => buildScript(fields, issues), [fields, issues])

  const [steps, setSteps] = useState<ChatStep[]>(script)
  const [stepIndex, setStepIndex] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState("")
  const [typing, setTyping] = useState(false)
  const [editReturn, setEditReturn] = useState<number | null>(null)
  const [upload, setUpload] = useState<UploadState | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const nextMsgId = useRef(0)
  const askedFor = useRef<string | null>(null)
  const attachAcked = useRef(false)
  const gateAttempts = useRef<Record<string, number>>({})
  const gating = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const reactId = useId()
  const idempotencyKey = useRef<string | null>(null)

  const step = steps[stepIndex]

  function pushMessage(role: "bot" | "user", text: string) {
    setMessages((prev) => [...prev, { id: nextMsgId.current++, role, text }])
  }

  // Ask the current step's question (typing indicator first), once per step visit.
  useEffect(() => {
    if (!step || submitted) return
    const key = `${stepKey(step)}#${stepIndex}`
    if (askedFor.current === key) return
    askedFor.current = key
    setTyping(true)
    const t = setTimeout(() => {
      setTyping(false)
      setMessages((prev) => [...prev, { id: nextMsgId.current++, role: "bot", text: questionFor(step) }])
      inputRef.current?.focus()
    }, STEP_DELAY_MS)
    return () => clearTimeout(t)
  }, [step, stepIndex, submitted])

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, typing, submitted, submitError])

  function advanceFrom(index: number, updatedSteps: ChatStep[]) {
    if (editReturn !== null) {
      const summaryIdx = updatedSteps.findIndex((s) => s.kind === "summary")
      setEditReturn(null)
      setStepIndex(summaryIdx)
    } else {
      setStepIndex(index + 1)
    }
  }

  // Steps whose free-text answers get an AI quality review before acceptance.
  function needsReview(s: ChatStep): boolean {
    if (s.kind === "title" || s.kind === "description") return true
    if (s.kind === "field" && (s.field.type === "text" || s.field.type === "richtext")) return true
    return false
  }

  async function checkGate(
    kind: "review" | "email",
    message: string,
    currentStep: ChatStep,
  ): Promise<{ ok: boolean; reply?: string } | null> {
    setTyping(true)
    try {
      const res = await fetch(`/api/support/${formId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          question: questionFor(currentStep),
          message,
          recent: messages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
        }),
      })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      return typeof data?.ok === "boolean" ? data : null
    } catch {
      return null
    } finally {
      setTyping(false)
    }
  }

  async function answerCurrent(rawValue: string, displayText: string) {
    if (!step || gating.current) return
    const error = validateAnswer(step, rawValue)
    if (error) {
      pushMessage("user", displayText || "(empty)")
      void respondToInvalidAnswer(error, rawValue)
      return
    }

    pushMessage("user", displayText || "Skipped")

    // Quality gates: AI review for gibberish/questions, MX check for emails.
    // Never trap anyone — after two rejected tries the answer is accepted as-is,
    // and any gate failure (endpoint down, timeout) accepts silently.
    if (rawValue.trim() && (step.kind === "email" || needsReview(step))) {
      const key = stepKey(step)
      const attempt = (gateAttempts.current[key] = (gateAttempts.current[key] ?? 0) + 1)
      if (attempt <= 2) {
        gating.current = true
        const gate = await checkGate(step.kind === "email" ? "email" : "review", rawValue, step)
        gating.current = false
        if (gate && !gate.ok) {
          pushMessage("bot", gate.reply || "Could you give me a bit more detail?")
          return
        }
      }
    }

    // If they ask about attaching something mid-conversation, reassure them
    // instead of silently swallowing the question.
    const attachStepAhead = steps
      .slice(stepIndex + 1)
      .some((s) => s.kind === "attachments" || (s.kind === "field" && s.field.type === "file"))
    if (!attachAcked.current && attachStepAhead && mentionsAttachment(rawValue)) {
      attachAcked.current = true
      pushMessage("bot", "And yes — you'll be able to attach photos or files before we send this. I'll ask you in a moment. 👍")
    }

    let updatedSteps = steps
    const key = stepKey(step)

    // A parent select with children gets a follow-up childSelect step.
    if (step.kind === "field" && step.field.type === "select") {
      const children = step.field.childOptions?.[rawValue] ?? []
      if (children.length > 0 && rawValue) {
        updatedSteps = [
          ...steps.slice(0, stepIndex + 1),
          { kind: "childSelect", field: step.field, parent: rawValue },
          ...steps.slice(stepIndex + 1),
        ]
        setSteps(updatedSteps)
        setAnswers((prev) => ({ ...prev, [key]: rawValue }))
        setDraft("")
        setStepIndex(stepIndex + 1)
        return
      }
    }

    // Child answer merges into the parent field's value, "Parent > Child".
    if (step.kind === "childSelect") {
      setAnswers((prev) => ({
        ...prev,
        [step.field.id]: rawValue ? `${step.parent} > ${rawValue}` : step.parent,
      }))
    } else {
      setAnswers((prev) => ({ ...prev, [key]: rawValue }))
    }

    setDraft("")
    setUpload(null)
    advanceFrom(stepIndex, updatedSteps)
  }

  // When a message fails validation but reads like prose (a question, an early
  // problem description), ask the AI assist endpoint for a contextual reply
  // instead of the canned validation nag. Falls back to the canned reply.
  async function respondToInvalidAnswer(fallbackError: string, userMessage: string) {
    const canned = `${fallbackError} Let's try that again.`
    const looksOffScript = userMessage.trim().split(/\s+/).length >= 3
    if (!looksOffScript || !step) {
      pushMessage("bot", canned)
      return
    }
    setTyping(true)
    try {
      const res = await fetch(`/api/support/${formId}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionFor(step),
          message: userMessage,
          recent: messages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
        }),
      })
      const data = res.ok ? await res.json().catch(() => null) : null
      const reply = typeof data?.reply === "string" ? data.reply.trim() : ""
      pushMessage("bot", reply || canned)
    } catch {
      pushMessage("bot", canned)
    } finally {
      setTyping(false)
    }
  }

  // ── File upload ──────────────────────────────────────────────────────────────

  async function uploadFile(file: File): Promise<string | null> {
    setUpload({ file, uploading: true, url: null, error: null })
    try {
      const url = await uploadIntakeFile(file, formId)
      setUpload(null)
      return url
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Upload failed"
      setUpload({ file, uploading: false, url: null, error: errMsg })
      pushMessage("bot", `Hmm, "${file.name}" didn't upload (${errMsg}). Mind trying again?`)
      return null
    }
  }

  async function handleFileSelect(file: File) {
    if (step?.kind === "attachments") {
      await ingestFiles([file])
      return
    }
    const url = await uploadFile(file)
    if (url) answerCurrentFile(url, file.name)
  }

  // Files arriving via the attachments step, paste, or drag-and-drop.
  async function ingestFiles(files: File[]) {
    if (submitted || submitting || files.length === 0) return

    let list = files
    // A file question currently on screen gets the first file.
    if (step?.kind === "field" && step.field.type === "file" && !answers[step.field.id]) {
      const url = await uploadFile(list[0])
      if (url) answerCurrentFile(url, list[0].name)
      list = list.slice(1)
    }

    let count = attachments.length
    let added = false
    for (const file of list) {
      if (count >= MAX_ATTACHMENTS) {
        pushMessage("bot", `That's the limit of ${MAX_ATTACHMENTS} attachments — the rest didn't make it in.`)
        break
      }
      const url = await uploadFile(file)
      if (!url) continue
      count++
      added = true
      setAttachments((prev) => [...prev, { name: file.name, url }])
      pushMessage("user", `📎 ${file.name}`)
    }
    if (!added) return

    attachAcked.current = true
    if (step?.kind === "attachments") {
      if (count >= MAX_ATTACHMENTS) {
        pushMessage("bot", "Let's move on.")
        advanceFrom(stepIndex, steps)
      } else {
        pushMessage("bot", "Got it! Add another, or tap Done when you're ready.")
      }
    } else {
      pushMessage("bot", "Got it — I'll attach that to your ticket. 📎")
    }
  }

  function finishAttachments() {
    pushMessage("user", attachments.length > 0 ? "That's all" : "No, skip that")
    setUpload(null)
    advanceFrom(stepIndex, steps)
  }

  // Paste-to-attach: screenshots pasted anywhere on the page land in the chat.
  const ingestRef = useRef(ingestFiles)
  useEffect(() => {
    ingestRef.current = ingestFiles
  })
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void ingestRef.current(files)
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  function answerCurrentFile(url: string, fileName: string) {
    if (!step || step.kind !== "field") return
    pushMessage("user", `📎 ${fileName}`)
    setAnswers((prev) => ({ ...prev, [step.field.id]: url }))
    setUpload(null)
    advanceFrom(stepIndex, steps)
  }

  // ── Edit from summary ────────────────────────────────────────────────────────

  function editStep(targetKey: string) {
    const idx = steps.findIndex((s) => stepKey(s) === targetKey)
    if (idx === -1) return
    setEditReturn(stepIndex)
    askedFor.current = null
    const existing = answers[targetKey] ?? ""
    setDraft(existing.includes(" > ") ? "" : existing)
    setStepIndex(idx)
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)

    // Stable across retries so the server can dedupe repeat submissions.
    if (!idempotencyKey.current) {
      idempotencyKey.current = `${formId}-${reactId}-${
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)
      }`
    }

    const responses = [
      ...fields.map((f) => ({
        fieldId: f.id,
        label: f.label,
        type: f.type,
        value: answers[f.id] ?? "",
      })),
      ...(answers["description"]?.trim()
        ? [{ fieldId: "__description", label: "Description", type: "richtext", value: answers["description"] }]
        : []),
      ...attachments.map((a, i) => ({
        fieldId: `__attachment_${i + 1}`,
        label: attachments.length > 1 ? `Attachment ${i + 1} (${a.name})` : `Attachment (${a.name})`,
        type: "file",
        value: a.url,
      })),
    ]

    const body =
      issues.length > 0
        ? {
            submitterName: answers["name"] ?? "",
            submitterEmail: answers["email"] ?? "",
            title: answers["title"] ?? "",
            issueId: answers["issue"] ?? "",
            responses,
            idempotencyKey: idempotencyKey.current,
          }
        : {
            submitterName: answers["name"] ?? "",
            submitterEmail: answers["email"] ?? "",
            title: answers["title"] ?? "",
            responses,
            idempotencyKey: idempotencyKey.current,
          }

    const res = await fetch(`/api/support/${formId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSubmitError((data as { error?: string }).error ?? "Something went wrong. Please try again.")
      setSubmitting(false)
      return
    }
    const data = (await res.json().catch(() => ({}))) as { pending?: boolean }
    // Default flow emails a verification link (no ticket yet). `pending === false`
    // is the degraded path where the ticket was created directly.
    setAwaitingVerification(data.pending !== false)
    setSubmitting(false)
    setSubmitted(true)
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  const showSummary = step?.kind === "summary" && !typing && !submitted

  return (
    <div
      className="relative flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card shadow-sm"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragOver(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        void ingestFiles(Array.from(e.dataTransfer.files))
      }}
    >
      {dragOver && !submitted && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-pen-id bg-pen-blue-tint/80 backdrop-blur-[2px]">
          <p className="flex items-center gap-2 font-poppins text-[14px] font-semibold text-pen-id">
            <Paperclip className="size-4" />
            Drop files to attach
          </p>
        </div>
      )}
      {/* Message log */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 font-poppins text-[13px] leading-relaxed",
                m.role === "user"
                  ? "rounded-br-md bg-pen-blue text-white"
                  : "rounded-bl-md bg-pen-surface text-pen-foreground",
              )}
            >
              {m.text}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-pen-surface px-4 py-3">
              <span className="size-1.5 animate-bounce rounded-full bg-pen-subtle [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-pen-subtle [animation-delay:120ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-pen-subtle [animation-delay:240ms]" />
            </div>
          </div>
        )}

        {showSummary && (
          <SummaryCard
            fields={fields}
            issues={issues}
            answers={answers}
            hasDescriptionStep={steps.some((s) => s.kind === "description")}
            attachments={
              steps.some((s) => s.kind === "attachments") || attachments.length > 0
                ? attachments
                : null
            }
            attachmentsEditable={steps.some((s) => s.kind === "attachments")}
            submitting={submitting}
            onEdit={editStep}
            onSend={handleSubmit}
          />
        )}

        {submitError && !submitted && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-pen-red/30 bg-pen-red-tint px-4 py-2.5 font-poppins text-[12.5px] text-pen-red">
              {submitError}{" "}
              <button type="button" onClick={handleSubmit} className="font-semibold underline underline-offset-2">
                Retry
              </button>
            </div>
          </div>
        )}

        {submitted && (
          <div className="flex justify-start">
            <div className="flex max-w-[85%] items-start gap-2.5 rounded-2xl rounded-bl-md bg-pen-surface px-4 py-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-500" />
              {awaitingVerification ? (
                <p className="font-poppins text-[13px] leading-relaxed text-pen-foreground">
                  Almost there, {answers["name"]}! We&apos;ve emailed a confirmation link to{" "}
                  {answers["email"]}. Click it to submit your request — your ticket is created once
                  you confirm. The link expires in 24 hours.
                </p>
              ) : (
                <p className="font-poppins text-[13px] leading-relaxed text-pen-foreground">
                  Your request is in! Thank you, {answers["name"]}.
                  <br />
                  We&apos;ll be in touch at {answers["email"]}.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input dock */}
      {!submitted && !showSummary && step && !typing && (
        <ChatInputDock
          step={step}
          draft={draft}
          upload={upload}
          attachmentCount={attachments.length}
          inputRef={inputRef}
          onDraftChange={setDraft}
          onAnswer={answerCurrent}
          onFileSelect={handleFileSelect}
          onFilesSelect={(files) => void ingestFiles(files)}
          onAttachmentsDone={finishAttachments}
        />
      )}
    </div>
  )
}

// ── Input dock ─────────────────────────────────────────────────────────────────

function ChatInputDock({
  step,
  draft,
  upload,
  attachmentCount,
  inputRef,
  onDraftChange,
  onAnswer,
  onFileSelect,
  onFilesSelect,
  onAttachmentsDone,
}: {
  step: ChatStep
  draft: string
  upload: UploadState | null
  attachmentCount: number
  inputRef: React.RefObject<HTMLInputElement | null>
  onDraftChange: (v: string) => void
  onAnswer: (rawValue: string, displayText: string) => void
  onFileSelect: (file: File) => void
  onFilesSelect: (files: File[]) => void
  onAttachmentsDone: () => void
}) {
  const isOptionalField = step.kind === "field" && !step.field.isRequired

  if (step.kind === "attachments") {
    return (
      <div className="flex flex-col gap-1.5 border-t border-pen-card-border p-3">
        <div className="flex items-center gap-2">
          <label
            className={cn(
              "flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-pen-card-border font-poppins text-[13px] text-pen-muted transition-colors hover:bg-pen-surface",
              upload?.uploading && "pointer-events-none opacity-60",
            )}
          >
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              className="sr-only"
              onChange={(e) => {
                onFilesSelect(Array.from(e.target.files ?? []))
                e.target.value = ""
              }}
            />
            {upload?.uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Paperclip className="size-4" />
                {attachmentCount > 0 ? "Add another file" : "Attach files"}
              </>
            )}
          </label>
          {upload?.error && (
            <span className="font-poppins text-[11.5px] text-pen-red">{upload.error}</span>
          )}
          <button
            type="button"
            onClick={onAttachmentsDone}
            className="rounded-full border border-pen-card-border bg-pen-surface px-4 py-2 font-poppins text-[12.5px] font-medium text-pen-foreground transition-colors hover:border-pen-id hover:text-pen-id"
          >
            {attachmentCount > 0 ? "Done" : "Skip"}
          </button>
        </div>
        <p className="text-center font-poppins text-[11px] text-pen-subtle">
          Tip: you can also paste a screenshot or drop files anywhere in the chat.
        </p>
      </div>
    )
  }

  // Chip steps: issue, select field, child select
  if (step.kind === "issue") {
    return (
      <ChipRow>
        {step.issues.map((i) => (
          <Chip key={i.id} onClick={() => onAnswer(i.id, i.name)}>{i.name}</Chip>
        ))}
        <AttachButton uploading={!!upload?.uploading} onFiles={onFilesSelect} />
      </ChipRow>
    )
  }

  if (step.kind === "field" && step.field.type === "select") {
    return (
      <ChipRow>
        {step.field.options.map((opt) => (
          <Chip key={opt} onClick={() => onAnswer(opt, opt)}>{opt}</Chip>
        ))}
        {isOptionalField && <SkipChip onClick={() => onAnswer("", "")} />}
        <AttachButton uploading={!!upload?.uploading} onFiles={onFilesSelect} />
      </ChipRow>
    )
  }

  if (step.kind === "childSelect") {
    const children = step.field.childOptions?.[step.parent] ?? []
    return (
      <ChipRow>
        {children.map((c) => (
          <Chip key={c} onClick={() => onAnswer(c, c)}>{c}</Chip>
        ))}
        <SkipChip onClick={() => onAnswer("", "")} />
        <AttachButton uploading={!!upload?.uploading} onFiles={onFilesSelect} />
      </ChipRow>
    )
  }

  if (step.kind === "field" && step.field.type === "file") {
    return (
      <div className="flex items-center gap-2 border-t border-pen-card-border p-3">
        <label
          className={cn(
            "flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-pen-card-border font-poppins text-[13px] text-pen-muted transition-colors hover:bg-pen-surface",
            upload?.uploading && "pointer-events-none opacity-60",
          )}
        >
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFileSelect(file)
            }}
          />
          {upload?.uploading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="size-4" /> Upload a file
            </>
          )}
        </label>
        {upload?.error && (
          <span className="font-poppins text-[11.5px] text-pen-red">{upload.error}</span>
        )}
        {isOptionalField && <SkipChip onClick={() => onAnswer("", "")} />}
      </div>
    )
  }

  // Text-ish steps: name, email, title, description, text/email/number/richtext fields
  const isMultiline =
    step.kind === "description" || (step.kind === "field" && step.field.type === "richtext")
  const canSkipText = isOptionalField || step.kind === "description"
  const inputType =
    step.kind === "email" || (step.kind === "field" && step.field.type === "email")
      ? "email"
      : step.kind === "field" && step.field.type === "number"
        ? "number"
        : "text"
  const placeholder =
    step.kind === "field"
      ? (step.field.placeholder ?? "Type your answer…")
      : step.kind === "name"
        ? "Full name"
        : step.kind === "email"
          ? "you@example.com"
          : step.kind === "description"
            ? "Describe the problem…"
            : "Type your answer…"

  function send() {
    onAnswer(draft, draft)
  }

  return (
    <div className="flex items-end gap-2 border-t border-pen-card-border p-3">
      {isMultiline ? (
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
          }}
          rows={3}
          placeholder={placeholder}
          className="flex-1 resize-none rounded-xl border border-pen-card-border bg-pen-surface px-3.5 py-2.5 font-poppins text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-2 focus:ring-pen-id/10"
        />
      ) : (
        <input
          ref={inputRef}
          type={inputType}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send()
          }}
          placeholder={placeholder}
          className="h-10 flex-1 rounded-xl border border-pen-card-border bg-pen-surface px-3.5 font-poppins text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id focus:ring-2 focus:ring-pen-id/10"
        />
      )}
      {canSkipText && !draft && <SkipChip onClick={() => onAnswer("", "")} />}
      <AttachButton uploading={!!upload?.uploading} onFiles={onFilesSelect} />
      <button
        type="button"
        onClick={send}
        title="Send"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pen-blue text-white transition-colors hover:bg-pen-blue/90"
      >
        <Send className="size-4" />
      </button>
    </div>
  )
}

function AttachButton({
  uploading,
  onFiles,
}: {
  uploading: boolean
  onFiles: (files: File[]) => void
}) {
  return (
    <label
      title="Attach files"
      className={cn(
        "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-pen-card-border bg-pen-surface text-pen-muted transition-colors hover:border-pen-id hover:text-pen-id",
        uploading && "pointer-events-none opacity-60",
      )}
    >
      <input
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />
      {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
    </label>
  )
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 border-t border-pen-card-border p-3">{children}</div>
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-pen-card-border bg-pen-surface px-4 py-2 font-poppins text-[12.5px] font-medium text-pen-foreground transition-colors hover:border-pen-id hover:text-pen-id"
    >
      {children}
    </button>
  )
}

function SkipChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-2 font-poppins text-[12px] text-pen-subtle transition-colors hover:text-pen-foreground"
    >
      Skip
    </button>
  )
}

// ── Summary card ───────────────────────────────────────────────────────────────

function SummaryCard({
  fields,
  issues,
  answers,
  hasDescriptionStep,
  attachments,
  attachmentsEditable,
  submitting,
  onEdit,
  onSend,
}: {
  fields: ChatField[]
  issues: ChatIssue[]
  answers: Record<string, string>
  hasDescriptionStep: boolean
  attachments: Attachment[] | null
  attachmentsEditable: boolean
  submitting: boolean
  onEdit: (stepKey: string) => void
  onSend: () => void
}) {
  const rows: { key: string; label: string; value: string; isFile?: boolean; noEdit?: boolean }[] = [
    { key: "name", label: "Name", value: answers["name"] ?? "" },
    { key: "email", label: "Email", value: answers["email"] ?? "" },
  ]
  if (issues.length > 0) {
    rows.push({
      key: "issue",
      label: "Issue type",
      value: issues.find((i) => i.id === answers["issue"])?.name ?? "",
    })
  }
  rows.push({ key: "title", label: "Title", value: answers["title"] ?? "" })
  if (hasDescriptionStep) {
    rows.push({ key: "description", label: "Description", value: answers["description"] ?? "" })
  }
  for (const f of fields) {
    rows.push({ key: f.id, label: f.label, value: answers[f.id] ?? "", isFile: f.type === "file" })
  }
  if (attachments !== null) {
    rows.push({
      key: "attachments",
      label: "Attachments",
      value: attachments.map((a) => a.name).join(", "),
      noEdit: !attachmentsEditable,
    })
  }

  return (
    <div className="rounded-2xl border border-pen-card-border bg-pen-surface p-4">
      <div className="flex flex-col divide-y divide-pen-card-border">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-3 py-2">
            <span className="w-28 shrink-0 font-sans text-[11.5px] font-semibold text-pen-muted">
              {r.label}
            </span>
            <span className="min-w-0 flex-1 truncate font-poppins text-[12.5px] text-pen-foreground">
              {r.isFile && r.value ? (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="size-3" /> Attached
                </span>
              ) : r.value ? (
                r.value
              ) : (
                <span className="text-pen-subtle">—</span>
              )}
            </span>
            {!r.noEdit && (
              <button
                type="button"
                onClick={() => onEdit(r.key)}
                title={`Edit ${r.label}`}
                className="shrink-0 rounded-md p-1 text-pen-subtle transition-colors hover:text-pen-id"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onSend}
        disabled={submitting}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-pen-blue font-poppins text-[13.5px] font-semibold text-white shadow-sm transition-all hover:bg-pen-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Sending…" : "Send ticket"}
      </button>
    </div>
  )
}
