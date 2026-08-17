# Chat-Style Intake Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat-style display mode to public support intake forms — the bot asks the form's questions one at a time and submits through the existing intake pipeline.

**Architecture:** `displayMode` enum column on `IntakeFormConfig` (FORM | CHAT, default FORM). Settings "New form"/edit modal gets a style picker; the list shows a Chat badge. The public page branches to a new `<IntakeChat />` client component when mode is CHAT. Conversation script is a pure function over `fields` + `issues` (testable without React). Submit reuses `/api/support/[uuid]/submit` with the exact same payload as `<IntakeForm />`.

**Tech Stack:** Next.js 16 App Router, Prisma (shared live Supabase dev DB — use migration-drift workaround), Tailwind + pen-* theme tokens, Vitest.

## Global Constraints

- Branch: **dev-v2**. NO commits without explicit user approval.
- Shared live dev DB: only additive DDL, applied via `prisma migrate diff` → `prisma db execute` → `prisma migrate resolve --applied` (drift workaround); run `prisma generate` after schema change.
- Test gate is "no NEW failures" (pre-existing failing baseline ~19).
- Submit payload must byte-match what `IntakeForm` sends: `{ submitterName, submitterEmail, title, issueId?, responses: [{fieldId, label, type, value}], idempotencyKey }`.

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (IntakeFormConfig, new enum)
- Create: `prisma/migrations/<ts>_add_intake_form_display_mode/migration.sql`

**Steps:**
- [ ] Add `enum IntakeFormDisplayMode { FORM CHAT }` and `displayMode IntakeFormDisplayMode @default(FORM)` to `IntakeFormConfig`.
- [ ] Generate SQL with `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` (expect: CREATE TYPE + ALTER TABLE ADD COLUMN ... DEFAULT 'FORM').
- [ ] Apply with `prisma db execute --file`, record with `prisma migrate resolve --applied`, then `npx prisma generate`.
- [ ] Verify: `npx tsc --noEmit` shows no NEW errors.

### Task 2: API accepts displayMode

**Files:**
- Modify: `src/app/api/intake/forms/route.ts` (POST: pass `displayMode` when it is "FORM"|"CHAT")
- Modify: `src/app/api/intake/forms/[id]/route.ts` (PATCH: same)

**Interfaces:** Produces: form JSON rows now include `displayMode: "FORM" | "CHAT"` (GET already returns all columns).

### Task 3: Chat script module + tests

**Files:**
- Create: `src/components/support/intake-chat-script.ts`
- Test: `src/components/support/intake-chat-script.test.ts`

**Interfaces (produced, consumed by Task 4):**
```ts
export type ChatStep =
  | { kind: "name" } | { kind: "email" } | { kind: "issue"; issues: {id,name}[] }
  | { kind: "title" }
  | { kind: "field"; field: Field }            // text/email/number/richtext/file/select parent
  | { kind: "childSelect"; field: Field; parent: string }
  | { kind: "summary" }
export function buildScript(fields: Field[], issues: Issue[]): ChatStep[]  // static steps; childSelect injected at runtime
export function validateAnswer(step: ChatStep, value: string): string | null  // error msg or null, mirrors IntakeForm.validate()
export function questionFor(step: ChatStep): string
```
- [ ] TDD: tests first — ordering (name→email→issue?→title→fields by order→summary), issue step omitted when no issues, required vs optional (empty answer on optional → ok, required → error), email regex, min/maxLength, min/max, pattern with patternMessage.
- [ ] Run `npx vitest run src/components/support/intake-chat-script.test.ts` → fail → implement → pass.

### Task 4: IntakeChat component

**Files:**
- Create: `src/components/support/intake-chat.tsx`

**Consumes:** Task 3 exports; existing `/api/intake/upload`; existing submit endpoint.
- [ ] Chat UI: message log (bot left / user right bubbles), typing indicator (~400ms) before bot messages, auto-scroll, input dock at bottom.
- [ ] Inputs per step: text/email/number → text input; select + issue → tappable chips; childOptions → follow-up childSelect step injected after parent answer; richtext → textarea; file → upload button reusing `/api/intake/upload` with progress + error retry chip; optional fields get a "Skip" chip.
- [ ] Validation via `validateAnswer`; invalid → bot error bubble re-asks.
- [ ] Summary card listing all answers + Edit (jump back to a step, keep other answers) + "Send ticket" button.
- [ ] Submit: identical payload/idempotency pattern as `intake-form.tsx:139-170`; success bubble mirrors form's confirmation; failure → error bubble + Retry chip.

### Task 5: Public page branch

**Files:**
- Modify: `src/app/support/[dept-slug]/[uuid]/page.tsx`
- [ ] Render `<IntakeChat formId fields issues formName deptName />` full-height (no card wrapper) when `form.displayMode === "CHAT"`; classic path untouched.

### Task 6: Settings UI

**Files:**
- Modify: `src/components/settings/settings-intake-forms-page.tsx`
- [ ] `FormRow`/modal types gain `displayMode`. New-form modal: "Form style" segmented picker (Classic form / Chat) → included in POST body; edit modal: same picker → PATCH body.
- [ ] List: `Chat` badge (MessageCircle icon) next to form name when `displayMode === "CHAT"`.

### Task 7: Verify

- [ ] `npx vitest run` → no NEW failures vs baseline.
- [ ] `npx tsc --noEmit` → no NEW errors.
- [ ] `npm run lint` → clean for touched files.
- [ ] Manual: create a Chat-style form in Settings on `npm run dev`, complete a chat submission, confirm the Intake row appears in Settings → submissions.
- [ ] STOP — show the user; commits only on their explicit instruction.
