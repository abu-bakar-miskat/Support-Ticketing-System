"use client"

import { useState, useRef, useId } from "react"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Paperclip, X, CheckCircle2, Loader2, Upload, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadIntakeFile } from "@/lib/api/upload-intake-file"
import { resolveIntakeDefaultFields, type ResolvedDefaultFields } from "@/lib/intake-default-fields"

type FieldValidation = {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  patternMessage?: string
}

type Field = {
  id: string
  label: string
  type: "text" | "richtext" | "select" | "file" | "email" | "number"
  isRequired: boolean
  options: string[]
  childOptions: Record<string, string[]>
  placeholder?: string | null
  helperText?: string | null
  validation?: FieldValidation | null
}

type FieldValue = string

type UploadState = {
  file: File
  uploading: boolean
  url: string | null
  error: string | null
}

function isImageFile(file: File) {
  return file.type.startsWith("image/")
}

export function IntakeForm({
  formId,
  fields,
  issues,
  defaultFields = resolveIntakeDefaultFields(null),
  accentColor,
  confirmationText,
}: {
  formId: string
  fields: Field[]
  issues: { id: string; name: string }[]
  /** Per-department overrides (title + placeholder) for the default static fields. */
  defaultFields?: ResolvedDefaultFields
  /** Per-form brand accent color for the submit button/highlights. */
  accentColor?: string
  /** Per-form custom message shown after a successful submission. */
  confirmationText?: string | null
}) {
  const [submitterName, setSubmitterName]   = useState("")
  const [submitterEmail, setSubmitterEmail] = useState("")
  const [title, setTitle]                   = useState("")
  const [issueId, setIssueId]               = useState("")
  const [values, setValues]                 = useState<Record<string, FieldValue>>({})
  const [uploads, setUploads]               = useState<Record<string, UploadState>>({})
  const [errors, setErrors]                 = useState<Record<string, string>>({})
  const [submitting, setSubmitting]         = useState(false)
  const [submitted, setSubmitted]           = useState(false)
  const [ticketNumber, setTicketNumber]     = useState<string | null>(null)
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [submitError, setSubmitError]       = useState<string | null>(null)

  const hasIssues = issues.length > 0

  const reactId = useId()
  const idempotencyKey = useRef(
    `${formId}-${reactId}-${typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
  )
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // ── File upload ──────────────────────────────────────────────────────────────

  async function handleFileSelect(fieldId: string, file: File) {
    setUploads((prev) => ({ ...prev, [fieldId]: { file, uploading: true, url: null, error: null } }))

    try {
      const url = await uploadIntakeFile(file, formId)
      setUploads((prev) => ({ ...prev, [fieldId]: { ...prev[fieldId], uploading: false, url } }))
      setValues((prev) => ({ ...prev, [fieldId]: url }))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setUploads((prev) => ({
        ...prev,
        [fieldId]: { ...prev[fieldId], uploading: false, error: message },
      }))
    }
  }

  function removeFile(fieldId: string) {
    setUploads((prev) => { const next = { ...prev }; delete next[fieldId]; return next })
    setValues((prev) => { const next = { ...prev }; delete next[fieldId]; return next })
    if (fileInputRefs.current[fieldId]) fileInputRefs.current[fieldId]!.value = ""
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!submitterName.trim()) errs["__name"] = "Name is required."
    if (!submitterEmail.trim()) errs["__email"] = "Email is required."
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail))
      errs["__email"] = "Enter a valid email address."
    if (hasIssues && !issueId) errs["__issue"] = "Please select an issue type."
    for (const field of fields) {
      const val    = values[field.id] ?? ""
      const upload = uploads[field.id]
      const isEmpty = field.type === "file" ? !upload?.url : !val.trim()

      if (field.isRequired && isEmpty) {
        errs[field.id] = `${field.label} is required.`
        continue
      }

      if (!isEmpty && field.validation) {
        const v = field.validation
        if ((field.type === "text" || field.type === "richtext") && v.minLength !== undefined && val.length < v.minLength)
          errs[field.id] = `Must be at least ${v.minLength} characters.`
        else if ((field.type === "text" || field.type === "richtext") && v.maxLength !== undefined && val.length > v.maxLength)
          errs[field.id] = `Must be at most ${v.maxLength} characters.`
        else if (field.type === "number" && v.min !== undefined && Number(val) < v.min)
          errs[field.id] = `Must be at least ${v.min}.`
        else if (field.type === "number" && v.max !== undefined && Number(val) > v.max)
          errs[field.id] = `Must be at most ${v.max}.`
        else if (v.pattern && !new RegExp(v.pattern).test(val))
          errs[field.id] = v.patternMessage ?? "Invalid format."
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setSubmitError(null)

    const responses = fields.map((f) => ({
      fieldId: f.id,
      label:   f.label,
      type:    f.type,
      value:   f.type === "file" ? (uploads[f.id]?.url ?? "") : (values[f.id] ?? ""),
    }))

    const body = hasIssues
      ? { submitterName, submitterEmail, title, issueId, responses, idempotencyKey: idempotencyKey.current }
      : { submitterName, submitterEmail, title, responses, idempotencyKey: idempotencyKey.current }

    const res = await fetch(`/api/support/${formId}/submit`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setSubmitError((data as { error?: string }).error ?? "Something went wrong. Please try again.")
      setSubmitting(false)
      return
    }
    const data = (await res.json().catch(() => ({}))) as { pending?: boolean; humanId?: string }
    // Default flow: a verification link was emailed and no ticket exists yet.
    // `pending === false` is the degraded path (email unavailable) where the
    // ticket was created directly and we can show its number.
    setAwaitingVerification(data.pending !== false)
    setTicketNumber(data.humanId ?? null)
    setSubmitted(true)
    setSubmitting(false)
  }

  // ── Success state ────────────────────────────────────────────────────────────

  if (submitted && awaitingVerification) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-pen-card-border bg-pen-card px-8 py-14 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="size-7 text-green-500" />
        </div>
        <div>
          <h2 className="font-poppins text-[19px] font-semibold text-pen-foreground">
            Almost there — check your inbox
          </h2>
          <p className="mt-2 font-poppins text-[13px] leading-relaxed text-pen-muted">
            We emailed a confirmation link to{" "}
            <span className="font-medium text-pen-foreground">{submitterEmail}</span>.
            <br />
            Click it to submit your request — your ticket is created once you confirm.
          </p>
          <p className="mt-3 font-poppins text-[11px] text-pen-subtle">
            The link expires in 24 hours. Don't see it? Check your spam folder.
          </p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-pen-card-border bg-pen-card px-8 py-14 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="size-7 text-green-500" />
        </div>
        <div>
          <h2 className="font-poppins text-[19px] font-semibold text-pen-foreground">
            Submission received
          </h2>
          <p className="mt-2 font-poppins text-[13px] leading-relaxed text-pen-muted">
            {confirmationText ? (
              confirmationText
            ) : (
              <>
                Thank you, <span className="font-medium text-pen-foreground">{submitterName}</span>.
                <br />
                We'll be in touch at {submitterEmail}.
              </>
            )}
          </p>
          {ticketNumber && (
            <div className="mt-1 flex flex-col items-center gap-1">
              <span className="font-poppins text-[11px] font-semibold uppercase tracking-wide text-pen-subtle">
                Ticket number
              </span>
              <span className="rounded-md border border-pen-card-border bg-pen-surface px-2.5 py-1 font-mono text-[12px] text-pen-foreground">
                {ticketNumber}
              </span>
              <span className="font-poppins text-[11px] text-pen-subtle">
                Please quote this in any follow-up.
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">

      {/* Contact info row */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label={defaultFields.submitterName.label} required error={errors["__name"]}>
          <input
            type="text"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            placeholder={defaultFields.submitterName.placeholder}
            className={inputCn(!!errors["__name"])}
          />
        </FormField>
        <FormField label={defaultFields.submitterEmail.label} required error={errors["__email"]}>
          <input
            type="email"
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            placeholder={defaultFields.submitterEmail.placeholder}
            className={inputCn(!!errors["__email"])}
          />
        </FormField>
      </div>

      {/* Title */}
      <FormField label={defaultFields.title.label}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultFields.title.placeholder}
          className={inputCn(false)}
        />
      </FormField>

      {/* Issue selector — only shown when the form has issues */}
      {hasIssues && (
        <FormField label={defaultFields.issueType.label} required error={errors["__issue"]}>
          <Select value={issueId} onValueChange={(v) => { if (v) { setIssueId(v); setErrors((prev) => { const next = { ...prev }; delete next["__issue"]; return next; }); } }}>
            <SelectTrigger className={cn(
              "!h-11 w-full rounded-xl border bg-pen-surface py-0 px-3.5 font-poppins text-[13px] text-pen-foreground transition-colors data-placeholder:text-pen-subtle",
              "focus:border-pen-id focus:ring-2 focus:ring-pen-id/10",
              errors["__issue"] ? "border-pen-red" : "border-pen-card-border",
            )}>
              <SelectValue>
                {(value: string) => value
                  ? (issues.find((i) => i.id === value)?.name ?? value)
                  : <span className="text-pen-subtle">{defaultFields.issueType.placeholder}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {issues.map((issue) => (
                <SelectItem key={issue.id} value={issue.id} className="font-poppins text-[13px]">
                  {issue.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {/* Divider */}
      {fields.length > 0 && <div className="h-px bg-pen-card-border" />}

      {/* Dynamic fields */}
      {fields.map((field) => (
        <FormField
          key={field.id}
          label={field.label}
          required={field.isRequired}
          helperText={field.helperText ?? undefined}
          error={errors[field.id]}
        >
          <DynamicField
            field={field}
            value={values[field.id] ?? ""}
            upload={uploads[field.id]}
            fileInputRef={(el) => { fileInputRefs.current[field.id] = el }}
            onChange={(val) => setValues((prev) => ({ ...prev, [field.id]: val }))}
            onFileSelect={(file) => handleFileSelect(field.id, file)}
            onFileRemove={() => removeFile(field.id)}
            hasError={!!errors[field.id]}
          />
        </FormField>
      ))}

      {/* Submit error */}
      {submitError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-pen-red/30 bg-pen-red-tint px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-pen-red" />
          <p className="font-poppins text-[12.5px] text-pen-red">{submitError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        className={cn(
          "flex h-12 items-center justify-center gap-2 rounded-xl font-poppins text-[14px] font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
          !accentColor && "bg-pen-blue",
        )}
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Submitting…" : "Submit request"}
      </button>
    </form>
  )
}

// ── Field wrapper ──────────────────────────────────────────────────────────────

function FormField({
  label,
  required,
  helperText,
  error,
  children,
}: {
  label:      string
  required?:  boolean
  helperText?: string
  error?:     string
  children:   React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-sans text-[13px] font-semibold text-pen-foreground">
        {label}
        {required && <span className="ml-0.5 text-pen-red">*</span>}
      </label>
      {children}
      {helperText && !error && (
        <p className="font-poppins text-[11.5px] text-pen-subtle">{helperText}</p>
      )}
      {error && (
        <p className="flex items-center gap-1 font-poppins text-[11.5px] text-pen-red">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

// ── Dynamic field renderer ─────────────────────────────────────────────────────

function DynamicField({
  field,
  value,
  upload,
  fileInputRef,
  onChange,
  onFileSelect,
  onFileRemove,
  hasError,
}: {
  field:        Field
  value:        string
  upload:       UploadState | undefined
  fileInputRef: (el: HTMLInputElement | null) => void
  onChange:     (val: string) => void
  onFileSelect: (file: File) => void
  onFileRemove: () => void
  hasError:     boolean
}) {
  if (field.type === "text") {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? undefined}
        className={inputCn(hasError)}
      />
    )
  }

  if (field.type === "email") {
    return (
      <input
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? "name@example.com"}
        className={inputCn(hasError)}
      />
    )
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? undefined}
        min={field.validation?.min}
        max={field.validation?.max}
        className={inputCn(hasError)}
      />
    )
  }

  if (field.type === "richtext") {
    return (
      <RichTextEditor
        content={value}
        onChange={onChange}
        placeholder={field.placeholder ?? "Write your response…"}
        className={cn(hasError && "border-pen-red")}
        showAttachButton={false}
      />
    )
  }

  if (field.type === "select") {
    const [parentVal, childVal] = value.includes(" > ") ? value.split(" > ") : [value, ""]
    const childOpts = parentVal ? (field.childOptions?.[parentVal] ?? []) : []

    const triggerCn = (error: boolean) =>
      cn(
        "!h-11 w-full rounded-xl border bg-pen-surface py-0 px-3.5 font-poppins text-[13px] text-pen-foreground transition-colors data-placeholder:text-pen-subtle",
        "focus:border-pen-id focus:ring-2 focus:ring-pen-id/10",
        error ? "border-pen-red" : "border-pen-card-border",
      )

    return (
      <div className={cn("flex gap-3", childOpts.length > 0 ? "flex-row" : "flex-col")}>
        <Select
          value={parentVal}
          onValueChange={(v) => v && onChange(v)}
        >
          <SelectTrigger className={triggerCn(hasError)}>
            <SelectValue placeholder="Select an option…" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt} className="font-poppins text-[13px]">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {childOpts.length > 0 && (
          <Select
            value={childVal}
            onValueChange={(v) => v && onChange(`${parentVal} > ${v}`)}
          >
            <SelectTrigger className={triggerCn(false)}>
              <SelectValue placeholder={`Select within ${parentVal}…`} />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {childOpts.map((child) => (
                <SelectItem key={child} value={child} className="font-poppins text-[13px]">
                  {child}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    )
  }

  if (field.type === "file") {
    // ── Uploaded — image preview ─────────────────────────────────────────────
    if (upload?.url && isImageFile(upload.file)) {
      return (
        <div className="overflow-hidden rounded-xl border border-pen-card-border bg-pen-surface">
          <div className="relative">
            <img
              src={upload.url}
              alt={upload.file.name}
              className="max-h-56 w-full object-contain bg-[#f8f9fb]"
            />
            <button
              type="button"
              onClick={onFileRemove}
              title="Remove image"
              className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 border-t border-pen-card-border px-3 py-2">
            <Paperclip className="size-3 shrink-0 text-pen-subtle" />
            <span className="min-w-0 flex-1 truncate font-poppins text-[11.5px] text-pen-muted">
              {upload.file.name}
            </span>
            <button
              type="button"
              onClick={onFileRemove}
              className="shrink-0 font-poppins text-[11px] text-pen-subtle transition-colors hover:text-pen-red"
            >
              Re-upload
            </button>
          </div>
        </div>
      )
    }

    // ── Uploaded — non-image file ────────────────────────────────────────────
    if (upload?.url) {
      return (
        <div className="flex items-center gap-2.5 rounded-xl border border-pen-card-border bg-pen-surface px-3.5 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-pen-blue-tint">
            <Paperclip className="size-3.5 text-pen-id" />
          </div>
          <span className="min-w-0 flex-1 truncate font-poppins text-[12.5px] font-medium text-pen-foreground">
            {upload.file.name}
          </span>
          <button
            type="button"
            onClick={onFileRemove}
            title="Remove file"
            className="shrink-0 text-pen-subtle transition-colors hover:text-pen-red"
          >
            <X className="size-4" />
          </button>
        </div>
      )
    }

    // ── Upload zone ──────────────────────────────────────────────────────────
    return (
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-pen-surface",
          hasError ? "border-pen-red" : "border-pen-card-border",
          upload?.uploading && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={fileInputRef}
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
            <Loader2 className="size-6 animate-spin text-pen-muted" />
            <span className="font-poppins text-[12.5px] text-pen-muted">Uploading…</span>
          </>
        ) : (
          <>
            <div className="flex size-11 items-center justify-center rounded-full border border-pen-card-border bg-pen-card shadow-sm">
              <Upload className="size-4 text-pen-muted" />
            </div>
            <div>
              <p className="font-poppins text-[13px] font-medium text-pen-foreground">
                Click to upload a file
              </p>
              <p className="mt-0.5 font-poppins text-[11.5px] text-pen-subtle">
                Images, PDF, Word, Excel · Max 20 MB
              </p>
            </div>
          </>
        )}
        {upload?.error && (
          <p className="font-sans text-[11.5px] text-pen-red">{upload.error}</p>
        )}
      </label>
    )
  }

  return null
}

function inputCn(hasError: boolean) {
  return cn(
    "h-11 w-full rounded-xl border bg-pen-surface px-3.5 font-poppins text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle transition-colors",
    "focus:border-pen-id focus:ring-2 focus:ring-pen-id/10",
    hasError ? "border-pen-red" : "border-pen-card-border",
  )
}
