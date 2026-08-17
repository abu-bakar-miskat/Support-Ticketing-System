// Pure conversation script for the chat-style intake form. Mirrors the
// validation rules in intake-form.tsx so both display modes accept the
// same answers.

export type ChatFieldValidation = {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
  patternMessage?: string
}

export type ChatField = {
  id: string
  label: string
  type: "text" | "richtext" | "select" | "file" | "email" | "number"
  isRequired: boolean
  options: string[]
  childOptions: Record<string, string[]>
  placeholder?: string | null
  helperText?: string | null
  validation?: ChatFieldValidation | null
}

export type ChatIssue = { id: string; name: string }

export type ChatStep =
  | { kind: "name" }
  | { kind: "email" }
  | { kind: "issue"; issues: ChatIssue[] }
  | { kind: "title" }
  | { kind: "field"; field: ChatField }
  | { kind: "childSelect"; field: ChatField; parent: string }
  | { kind: "description" }
  | { kind: "attachments" }
  | { kind: "summary" }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ATTACHMENT_INTENT_RE = /attach|photo|screenshot|screen shot|upload|image|\bfile\b|picture/i

export function buildScript(fields: ChatField[], issues: ChatIssue[]): ChatStep[] {
  const steps: ChatStep[] = [{ kind: "name" }, { kind: "email" }]
  if (issues.length > 0) steps.push({ kind: "issue", issues })
  steps.push({ kind: "title" })
  // Forms without their own long-text field still get a description step,
  // and forms without a file field still get a generic attachments step.
  if (!fields.some((f) => f.type === "richtext")) steps.push({ kind: "description" })
  for (const field of fields) steps.push({ kind: "field", field })
  if (!fields.some((f) => f.type === "file")) steps.push({ kind: "attachments" })
  steps.push({ kind: "summary" })
  return steps
}

export function mentionsAttachment(text: string): boolean {
  return ATTACHMENT_INTENT_RE.test(text)
}

export function validateAnswer(step: ChatStep, value: string): string | null {
  const val = value ?? ""

  if (step.kind === "name") return val.trim() ? null : "Name is required."
  if (step.kind === "email")
    return EMAIL_RE.test(val.trim()) ? null : "That doesn't look like a valid email address."
  if (step.kind === "issue") return val ? null : "Please pick an issue type."
  if (step.kind === "title") return null
  if (step.kind === "childSelect") return null
  if (step.kind === "description") return null
  if (step.kind === "attachments") return null
  if (step.kind === "summary") return null

  const { field } = step
  const isEmpty = !val.trim()

  if (isEmpty) return field.isRequired ? `${field.label} is required.` : null

  if (field.type === "email" && !EMAIL_RE.test(val.trim()))
    return "That doesn't look like a valid email address."

  const v = field.validation
  if (!v) return null

  if ((field.type === "text" || field.type === "richtext") && v.minLength !== undefined && val.length < v.minLength)
    return `Must be at least ${v.minLength} characters.`
  if ((field.type === "text" || field.type === "richtext") && v.maxLength !== undefined && val.length > v.maxLength)
    return `Must be at most ${v.maxLength} characters.`
  if (field.type === "number" && v.min !== undefined && Number(val) < v.min)
    return `Must be at least ${v.min}.`
  if (field.type === "number" && v.max !== undefined && Number(val) > v.max)
    return `Must be at most ${v.max}.`
  if (v.pattern && !new RegExp(v.pattern).test(val)) return v.patternMessage ?? "Invalid format."

  return null
}

export function questionFor(step: ChatStep): string {
  switch (step.kind) {
    case "name":
      return "Hi! I'll help you raise a support request. What's your name?"
    case "email":
      return "Nice to meet you! What's your email address, so we can get back to you?"
    case "issue":
      return "What kind of issue is this about?"
    case "title":
      return "In a few words, what do you need help with?"
    case "field":
      return step.field.helperText
        ? `${step.field.label} — ${step.field.helperText}`
        : step.field.label
    case "childSelect":
      return `Which one within ${step.parent}?`
    case "description":
      return "Tell me a bit more about it — what's happening, and what would you like us to do?"
    case "attachments":
      return "Anything you'd like to attach — photos, screenshots, files? You can add a few, or just skip this."
    case "summary":
      return "Here's what I've got. Want to check anything before sending?"
  }
}
