# Chat-Style Intake Form — Design

**Date:** 2026-07-21
**Author:** Dumitru-radu + Claude
**Status:** Draft, pending review

## Goal

Offer a conversational (chatbot-style) version of the public support intake form.
Instead of a page of fields, the user answers one question at a time in a chat UI;
at the end the ticket is submitted through the existing intake pipeline.

The chat is **scripted, not AI-powered**: questions come directly from the form's
field definitions. No LLM, no API keys, no per-message cost.

## Decision summary

- Chat is a **display style of an intake form**, chosen at form creation.
- Managed in **Settings → Support forms** exactly like existing forms: appears in
  the list, has an Active toggle, a public Copy link, Issues, Add Field, edit, delete.
- Visibility control = same as today: a form is only reachable by whoever has its
  link, and can be deactivated anytime. No extra gating mechanism.
- Rollout: Dumitru creates one chat-style form privately, pilots it, and shares
  the link when satisfied.

## Data model

Add one column to `IntakeFormConfig`:

```prisma
enum IntakeFormDisplayMode {
  FORM
  CHAT
}

model IntakeFormConfig {
  // ...existing fields...
  displayMode IntakeFormDisplayMode @default(FORM)
}
```

- Default `FORM` — all existing forms keep behaving exactly as today.
- Migration is additive (new enum + column with default). Follow the project's
  shared-dev-DB migration-drift workaround when applying.

## Settings UI (`settings-intake-forms-page.tsx`)

- **New form dialog:** add a style picker — "Classic form" (default) / "Chat".
- **Form list:** chat-style forms show a small `Chat` badge next to the name.
- Everything else (Issues, Add Field, edit, delete, Active toggle, Copy link)
  works unchanged — chat forms use the same fields and issues.
- Editing: `displayMode` can be changed later in the form's edit dialog, so an
  existing form can be converted to chat and back.

## Public page rendering

`/support/[dept-slug]/[uuid]/page.tsx` already loads the form config. It branches:

- `displayMode === "FORM"` → existing `<IntakeForm />` (untouched).
- `displayMode === "CHAT"` → new `<IntakeChat />` component
  (`src/components/support/intake-chat.tsx`).

## Chat conversation flow

`<IntakeChat />` is a client component that walks a fixed script derived from the
form definition. Message bubbles: bot on the left, user answers on the right.

1. **Greeting:** "Hi! I'll help you raise a support request. What's your name?"
2. **Name** → free text input.
3. **Email** → free text, validated as email before advancing.
4. **Issue type** (only if the form has issues): rendered as tappable chips —
   one tap answers.
5. **Title:** "In a few words, what do you need help with?"
6. **Custom fields**, in their configured `order`, one per turn:
   - `text` / `email` / `number` → text input with the field's validation
     (minLength, maxLength, min, max, pattern) enforced before advancing.
   - `select` → tappable chips from `options`; child selects (via `childOptions`)
     asked as a follow-up turn after the parent is chosen.
   - `richtext` → multiline input (plain textarea in chat; stored as the same
     value shape the submit API already accepts).
   - `file` → an upload button in the chat; uses the existing
     `/api/intake/upload` endpoint and shows upload progress/errors inline.
   - Optional fields offer a "Skip" chip; required fields do not advance
     until answered.
7. **Validation errors** appear as a bot reply ("Hmm, that doesn't look like a
   valid email — mind checking it?") and re-ask the same question.
8. **Summary card:** bot shows a recap of all answers with an **Edit** affordance
   (tapping an answer jumps back to that question, then fast-forwards through
   already-answered ones) and a **Send ticket** button.
9. **Submit:** POSTs the same payload shape as `<IntakeForm />` to
   `/api/support/[uuid]/submit`, reusing the idempotency-key pattern.
10. **Done:** success bubble mirrors the existing form's confirmation (ticket
    reference, "we'll reply by email"). Submit failure shows a retry bubble
    without losing the conversation state.

## What does NOT change

- Submit API, validation, ticket/Intake creation, notifications.
- Field builder, Issues management, submissions pages.
- Existing forms and their public links.

## State & implementation notes

- All conversation state lives in component state (answers map keyed by field id,
  current step index, message log). No new persistence.
- The script is computed once from `fields` + `issues` props — same props
  `<IntakeForm />` receives today — so the server page passes identical data to
  either component.
- Auto-scroll to the newest message; input area fixed at the bottom; a subtle
  typing indicator (~400ms) before each bot question for a natural feel.
- Match the app's existing theme tokens (globals/theme variants) rather than
  introducing new colors.

## Error handling

- Upload failure → bot bubble with the error + "Try again" chip.
- Submit failure → bot bubble with error + "Retry" (idempotency key prevents
  duplicate tickets on retry).
- Inactive form → same inactive/closed state the classic form shows.

## Testing

- Unit tests (Vitest) for the script builder: field ordering, required/optional
  handling, child-select expansion, validation gating.
- Component test for the happy path: answer all questions → summary → submit
  payload matches what `<IntakeForm />` would send.
- Existing `/api/support/[uuid]/submit` tests remain the safety net for the
  backend (unchanged).
- Manual pilot: Dumitru creates a chat-style form, runs a real submission on dev,
  verifies the Intake appears in the submissions page.

## Future (explicitly out of scope now)

- LLM layer (free-text classification, auto-drafted titles).
- Chat widget embedded on other pages.
- Multi-language greetings.
