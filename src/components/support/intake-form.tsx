"use client"

import { useState, useRef, useId } from "react"
import { RichTextEditor } from "@/components/ui/rich-text-editor"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Paperclip, X, CheckCircle2, Loader2, Upload, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { uploadIntakeFile } from "@/lib/api/upload-intake-file"
import { resolveIntakeDefaultFields, type ResolvedDefaultFields } from "@/lib/intake-default-fields"
import { isFieldVisible, toFormFieldDef, validateSubmission } from "@/lib/form-validation"
import { Tip } from "@/components/ui/tooltip"

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
  type: "text" | "richtext" | "select" | "file" | "email" | "number" | "checkbox" | "radio" | "date"
  isRequired: boolean
  options: string[]
  childOptions: Record<string, string[]>
  placeholder?: string | null
  helperText?: string | null
  validation?: FieldValidation | null
  visibleWhen?: { fieldId: string; equals?: string; in?: string[] } | null
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
  accentFg,
  confirmationText,
}: {
  formId: string
  fields: Field[]
  issues: { id: string; name: string }[]
  /** Per-department overrides (title + placeholder) for the default static fields. */
  defaultFields?: ResolvedDefaultFields
  /** Per-form brand accent color for the submit button/highlights. */
  accentColor?: string
  /** Text color that stays readable on `accentColor`. */
  accentFg?: string
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
    const submissionValues: Record<string, unknown> = {}
    for (const field of fields) {
      submissionValues[field.id] = field.type === "file"
        ? (uploads[field.id]?.url ?? "")
        : (values[field.id] ?? "")
    }
    const result = validateSubmission(fields.map(toFormFieldDef), submissionValues)
    Object.assign(errs, result.errors)
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
    // `pending === false` means the submitter's email is already verified (or
    // belongs to an account), so the ticket was created directly and we can show its number.
    setAwaitingVerification(data.pending !== false)
    setTicketNumber(data.humanId ?? null)
    setSubmitted(true)
    setSubmitting(false)
  }

  // ── Success state ────────────────────────────────────────────────────────────

  if (submitted && awaitingVerification) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-sts-card-border bg-sts-card px-8 py-14 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="size-7 text-green-500" />
        </div>
        <div>
          <h2 className="font-poppins text-[19px] font-semibold text-sts-foreground">
            Almost there — check your inbox
          </h2>
          <p className="mt-2 font-poppins text-[13px] leading-relaxed text-sts-muted">
            We emailed a confirmation link to{" "}
            <span className="font-medium text-sts-foreground">{submitterEmail}</span>.
            <br />
            Click it to submit your request — your ticket is created once you confirm.
          </p>
          <p className="mt-3 font-poppins text-[11px] text-sts-subtle">
            The link expires in 24 hours. Don't see it? Check your spam folder.
          </p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-sts-card-border bg-sts-card px-8 py-14 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="size-7 text-green-500" />
        </div>
        <div>
          <h2 className="font-poppins text-[19px] font-semibold text-sts-foreground">
            Submission received
          </h2>
          <p className="mt-2 font-poppins text-[13px] leading-relaxed text-sts-muted">
            {confirmationText ? (
              confirmationText
            ) : (
              <>
                Thank you, <span className="font-medium text-sts-foreground">{submitterName}</span>.
                <br />
                We'll be in touch at {submitterEmail}.
              </>
            )}
          </p>
          {ticketNumber && (
            <div className="mt-1 flex flex-col items-center gap-1">
              <span className="font-poppins text-[11px] font-semibold uppercase tracking-wide text-sts-subtle">
                Ticket number
              </span>
              <span className="rounded-md border border-sts-card-border bg-sts-surface px-2.5 py-1 font-mono text-[12px] text-sts-foreground">
                {ticketNumber}
              </span>
              <span className="font-poppins text-[11px] text-sts-subtle">
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
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-6"
      style={accentColor ? { ["--form-accent" as string]: accentColor } : undefined}
    >

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
            <SelectTrigger className={cn(selectCn(!!errors["__issue"]))}>
              <SelectValue>
                {(value: string) => value
                  ? (issues.find((i) => i.id === value)?.name ?? value)
                  : <span className="text-sts-subtle">{defaultFields.issueType.placeholder}</span>}
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

      {/* Dynamic fields */}
      {fields.filter((field) => isFieldVisible(toFormFieldDef(field), values)).map((field) => (
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
        <div className="flex items-start gap-2.5 rounded-xl border border-sts-red/30 bg-sts-red-tint px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-sts-red" />
          <p className="font-poppins text-[12.5px] text-sts-red">{submitError}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={accentColor ? { backgroundColor: accentColor, color: accentFg ?? "#ffffff" } : undefined}
        className={cn(
          "flex h-12 items-center justify-center gap-2 rounded-full font-poppins text-[14px] font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
          !accentColor && "bg-sts-blue",
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
      <label className="px-0.5 font-poppins text-[13px] font-semibold text-sts-foreground">
        {label}
        {required && <span className="ml-0.5 text-sts-red">*</span>}
      </label>
      {children}
      {helperText && !error && (
        <p className="font-poppins text-[11.5px] text-sts-subtle">{helperText}</p>
      )}
      {error && (
        <p className="flex items-center gap-1 font-poppins text-[11.5px] text-sts-red">
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
        className={cn(
          "!rounded-xl !border-transparent !bg-[#f3f4f6] focus-within:!border-[var(--form-accent,var(--sts-id))] focus-within:!bg-white focus-within:!shadow-[0_0_0_4px_color-mix(in_srgb,var(--form-accent,var(--sts-id))_14%,transparent)]",
          hasError && "!border-sts-red",
        )}
        showAttachButton={false}
      />
    )
  }

  if (field.type === "select") {
    const [parentVal, childVal] = value.includes(" > ") ? value.split(" > ") : [value, ""]
    const childOpts = parentVal ? (field.childOptions?.[parentVal] ?? []) : []

    const triggerCn = (error: boolean) => selectCn(error)

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

  if (field.type === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCn(hasError)}
      />
    )
  }

  if (field.type === "radio") {
    return (
      <div className="flex flex-col gap-2">
        {field.options.map((opt) => (
          <label
            key={opt}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 font-poppins text-[14px] text-sts-foreground transition-colors",
              value === opt
                ? "bg-[color-mix(in_srgb,var(--form-accent,var(--sts-id))_10%,white)] shadow-[inset_0_0_0_1.5px_var(--form-accent,var(--sts-id))]"
                : "bg-[#f3f4f6] hover:bg-[#eceef2]",
            )}
          >
            <input
              type="radio"
              name={field.id}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="size-4 accent-[var(--form-accent,var(--sts-blue))]"
            />
            {opt}
          </label>
        ))}
      </div>
    )
  }

  if (field.type === "checkbox") {
    if (field.options.length === 0) {
      return (
        <label
          className={cn(
            "flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 font-poppins text-[14px] text-sts-foreground transition-colors",
            value === "true"
              ? "bg-[color-mix(in_srgb,var(--form-accent,var(--sts-id))_10%,white)] shadow-[inset_0_0_0_1.5px_var(--form-accent,var(--sts-id))]"
              : "bg-[#f3f4f6] hover:bg-[#eceef2]",
          )}
        >
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="size-4 rounded accent-[var(--form-accent,var(--sts-blue))]"
          />
          {field.placeholder || "Yes"}
        </label>
      )
    }
    const selected = new Set(value.split(",").map((s) => s.trim()).filter(Boolean))
    return (
      <div className="flex flex-col gap-2">
        {field.options.map((opt) => {
          const checked = selected.has(opt)
          return (
            <label
              key={opt}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 font-poppins text-[14px] text-sts-foreground transition-colors",
                checked
                  ? "bg-[color-mix(in_srgb,var(--form-accent,var(--sts-id))_10%,white)] shadow-[inset_0_0_0_1.5px_var(--form-accent,var(--sts-id))]"
                  : "bg-[#f3f4f6] hover:bg-[#eceef2]",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = new Set(selected)
                  if (checked) next.delete(opt)
                  else next.add(opt)
                  onChange([...next].join(","))
                }}
                className="size-4 rounded accent-[var(--form-accent,var(--sts-blue))]"
              />
              {opt}
            </label>
          )
        })}
      </div>
    )
  }

  if (field.type === "file") {
    // ── Uploaded — image preview ─────────────────────────────────────────────
    if (upload?.url && isImageFile(upload.file)) {
      return (
        <div className="overflow-hidden rounded-xl border border-sts-card-border bg-sts-surface">
          <div className="relative">
            <img
              src={upload.url}
              alt={upload.file.name}
              className="max-h-56 w-full object-contain bg-[#f8f9fb]"
            />
            <Tip label="Remove image">
              <button
                aria-label="Remove image"
                type="button"
                onClick={onFileRemove}
                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
              >
                <X className="size-3.5" />
              </button>
            </Tip>
          </div>
          <div className="flex items-center gap-2 border-t border-sts-card-border px-3 py-2">
            <Paperclip className="size-3 shrink-0 text-sts-subtle" />
            <span className="min-w-0 flex-1 truncate font-poppins text-[11.5px] text-sts-muted">
              {upload.file.name}
            </span>
            <button
              type="button"
              onClick={onFileRemove}
              className="shrink-0 font-poppins text-[11px] text-sts-subtle transition-colors hover:text-sts-red"
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
        <div className="flex items-center gap-2.5 rounded-xl border border-sts-card-border bg-sts-surface px-3.5 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sts-blue-tint">
            <Paperclip className="size-3.5 text-sts-id" />
          </div>
          <span className="min-w-0 flex-1 truncate font-poppins text-[12.5px] font-medium text-sts-foreground">
            {upload.file.name}
          </span>
          <Tip label="Remove file">
            <button
              aria-label="Remove file"
              type="button"
              onClick={onFileRemove}
              className="shrink-0 text-sts-subtle transition-colors hover:text-sts-red"
            >
              <X className="size-4" />
            </button>
          </Tip>
        </div>
      )
    }

    // ── Upload zone ──────────────────────────────────────────────────────────
    return (
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-transparent bg-[#f3f4f6] px-4 py-8 text-center transition-colors hover:bg-[#eceef2]",
          hasError && "border-sts-red bg-sts-red-tint",
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
            <Loader2 className="size-6 animate-spin text-sts-muted" />
            <span className="font-poppins text-[12.5px] text-sts-muted">Uploading…</span>
          </>
        ) : (
          <>
            <div className="flex size-11 items-center justify-center rounded-full border border-sts-card-border bg-sts-card shadow-sm">
              <Upload className="size-4 text-sts-muted" />
            </div>
            <div>
              <p className="font-poppins text-[13px] font-medium text-sts-foreground">
                Click to upload a file
              </p>
              <p className="mt-0.5 font-poppins text-[11.5px] text-sts-subtle">
                Images, PDF, Word, Excel · Max 20 MB
              </p>
            </div>
          </>
        )}
        {upload?.error && (
          <p className="font-sans text-[11.5px] text-sts-red">{upload.error}</p>
        )}
      </label>
    )
  }

  return null
}

const fieldShell =
  "h-[52px] w-full rounded-xl border border-transparent bg-[#f3f4f6] px-4 font-poppins text-[15px] text-sts-foreground outline-none transition-[background-color,border-color,box-shadow] placeholder:text-[#9ca3af] hover:bg-[#eceef2] focus:border-[var(--form-accent,var(--sts-id))] focus:bg-white focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--form-accent,var(--sts-id))_16%,transparent)]"

function inputCn(hasError: boolean) {
  return cn(fieldShell, hasError && "border-sts-red bg-sts-red-tint hover:bg-sts-red-tint")
}

function selectCn(hasError: boolean) {
  return cn(
    fieldShell,
    "!h-[52px] !w-full !rounded-xl !border-transparent !bg-[#f3f4f6] !px-4 !py-0 !shadow-none hover:!bg-[#eceef2]",
    "focus-visible:!border-[var(--form-accent,var(--sts-id))] focus-visible:!bg-white focus-visible:!ring-4 focus-visible:!ring-[color-mix(in_srgb,var(--form-accent,var(--sts-id))_16%,transparent)]",
    "data-placeholder:text-[#9ca3af]",
    hasError && "!border-sts-red !bg-sts-red-tint",
  )
}
