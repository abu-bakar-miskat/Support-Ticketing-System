"use client"

import { useEffect, useState } from "react"
import { BookOpen, Check, Copy, Server, ShieldCheck, X } from "lucide-react"

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-sts-card-border bg-[#171918] text-[#eef0ed] dark:bg-[#111312]">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2.5 top-2.5 inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/8 px-2.5 font-sans text-[10.5px] font-medium text-white/70 transition-colors hover:bg-white/14 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="overflow-x-auto px-4 py-4 pr-20 font-mono text-[11.5px] leading-6">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function DocSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 border-b border-sts-card-border pb-8 last:border-0 last:pb-0">
      <h3 className="font-sans text-[18px] font-semibold tracking-[-0.02em] text-sts-foreground">{title}</h3>
      <div className="mt-3 space-y-4 font-sans text-[13px] leading-6 text-sts-muted">{children}</div>
    </section>
  )
}

const ENDPOINTS = [
  ["GET", "/api/portal/v1", "Check the key and tenant"],
  ["GET", "/api/portal/v1/form", "Get the linked support form"],
  ["POST", "/api/portal/v1/form/submissions", "Submit the form and create a ticket"],
  ["GET", "/api/portal/v1/submissions?email={email}", "List a requester's submissions"],
  ["GET", "/api/portal/v1/submissions/{submissionId}", "Get one submission"],
  ["GET", "/api/portal/v1/tickets/{ticketId}", "View a ticket and its comments"],
  ["POST", "/api/portal/v1/tickets/{ticketId}/comments", "Add a requester comment"],
] as const

export function PortalApiDocumentation({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, open])

  if (!open) return null

  const origin = window.location.origin
  const baseUrl = `${origin}/api/portal/v1`
  const formExample = `curl "${baseUrl}/form" \\
  -H "Authorization: Bearer $SUPPORT_API_KEY" \\
  -H "Accept: application/json"`
  const submissionExample = `curl "${baseUrl}/form/submissions" \\
  -X POST \\
  -H "Authorization: Bearer $SUPPORT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: <unique-request-id>" \\
  --data '{
    "submitterName": "Amira Khan",
    "submitterEmail": "amira@example.com",
    "title": "Unable to access my account",
    "issueId": "<issue-id-from-form>",
    "responses": [
      { "fieldId": "<field-id>", "value": "The login page shows an error." }
    ]
  }'`
  const serverExample = `const baseUrl = process.env.SUPPORT_API_BASE_URL;
const apiKey = process.env.SUPPORT_API_KEY;

export async function supportApi(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      Authorization: \`Bearer \${apiKey}\`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || \`API error \${response.status}\`);
  return data;
}`
  const implementationPrompt = `You are implementing a Technical Support area in an existing tenant portal.

Project context
- Portal/application: [PORTAL NAME]
- Technology stack: [TECH STACK]
- Designated tenants: [TENANT IDS OR CONFIGURATION RULE]
- Privacy notice URL: [PRIVACY NOTICE URL]
- Agreed ticket retention period: [RETENTION PERIOD]
- Global Support API base URL: ${baseUrl}
- Authentication method used by this portal: [AUTHENTICATION METHOD]

First inspect the existing application structure, authentication and authorization model, tenant resolution, design system, form components, validation conventions, accessibility patterns, test setup, and audit-log facilities. Reuse established patterns.

Build the following feature.

1. Availability and navigation
- Show a "Technical Support" menu only when the signed-in user's server-resolved tenant is in the designated-tenant configuration. Enforce the same entitlement on every backend route; hiding UI is not authorization.
- Include a ticket list and a clearly labelled "+" action for raising a request. Follow existing responsive, terminology, interaction, and accessibility conventions.

2. Security architecture
- Call the Global Support API only from the portal server. The browser calls authenticated same-origin portal routes.
- Keep SUPPORT_API_BASE_URL and SUPPORT_API_KEY in server secrets. Never expose the key in browser code, public environment variables, HTML, URLs, local storage, analytics, errors, or logs.
- Send Bearer authentication and Accept: application/json; send Content-Type: application/json with JSON bodies.
- Derive tenant ID, requester name, and requester email from the authenticated server session, never browser input.
- Use one API key per tenant portal. Store returned submissionId and ticketId against the authenticated user and tenant. Verify ownership before every submission/ticket read or comment post so changing a URL or ID cannot expose another user or tenant.
- Apply CSRF protection, output escaping, HTTPS, outbound timeouts, redirect restrictions, sensitive-log redaction, and per-user limits.

3. Portal backend adapter
Create authenticated portal-server routes/services for:
- GET /form — load the linked form.
- POST /form/submissions — create one central ticket.
- GET /submissions?email={authenticated-user-email} — list only the signed-in user's submissions.
- GET /submissions/{submissionId} — retrieve an owned submission.
- GET /tickets/{ticketId} — retrieve an owned ticket and requester-visible comments.
- POST /tickets/{ticketId}/comments — add a requester comment to an owned ticket.
Do not build a generic proxy accepting arbitrary upstream paths, identity parameters, or unverified record IDs.

4. Dynamic support form
- Fetch the current form on page load or use only a short server cache. Never hard-code form fields or issue IDs.
- Render defaultFields for name, email, title, and issue type. Name/email come from the session and are read-only or server-overridden.
- Render issues as the required issue selector and submit its id. Build one reusable schema-driven field renderer that supports every configured type:
  - text — Short text: accessible single-line input.
  - richtext — Rich text: the portal's accessible rich-text editor, submitting the documented string format.
  - email — Email: email input with client and server validation.
  - number — Number: numeric control submitted as a string, respecting configured limits.
  - select — Dropdown: supplied options; support childOptions and submit nested values as Parent option > Child option.
  - radio — Radio: one labelled group using the supplied options.
  - checkbox — Checkbox: labelled group; submit selected options comma-separated, or "true" for a selected optionless checkbox.
  - date — Date: accessible date control submitted as YYYY-MM-DD.
  - file — File upload: labelled control with selected-file, validation, progress, remove, success, and failure states. Use an approved secure upload flow and submit only its opaque reference string.
- Add an accessible unsupported-field fallback and report unknown types; never silently omit a required field.
- Enforce isRequired, options, childOptions, validation, placeholder, helperText, and visibleWhen. Omit hidden fields. Submit every custom value as a string.
- Submit submitterName, submitterEmail, title, issueId, and responses. Never ask the requester for department, sub-department, SLA, assignee, project, or status; issue configuration controls central routing.
- The form-submission endpoint accepts only a string for a file response, not binary or base64. Never submit file contents, storage URLs, or a local filename. Keep the reusable File upload control implemented, but disable submission with a clear explanation until an approved upload endpoint, file constraints, malware scanning, access control, retention policy, and opaque-reference format are available.

5. Exactly-once submission
- Generate and persist one unguessable Idempotency-Key per logical submission before sending. Reuse it for every retry; replace it only for an intentionally new request.
- Disable repeat submission while in flight and preserve entered values after recoverable failures.
- On success, store submissionId, ticketId, and ticketReference, clear the draft/idempotency record, and show the reference plus a link to the ticket list.
- Treat duplicate: true as a successful return of the original ticket.

6. Ticket list and detail
- List only the signed-in user's submissions, using the server-session email rather than browser input.
- Show Reference, Subject, Department, Status, and Last Updated using reference, title, department/subDepartment, status, and lastActivityAt (or updatedAt fallback).
- Ticket properties are read-only. Do not provide edit, assignment, routing, priority, project, SLA, or status-change actions.
- Requester comments are the only mutation. Follow the comment and reply rules below.
- Show a "Last refreshed" timestamp for the last successful fetch, distinct from ticket timestamps. Provide manual refresh and rate-limit-safe revalidation/polling that pauses when hidden.

7. Comments, replies, and privacy
- GET /tickets/{ticketId} returns each comment with id, body, createdAt, editedAt, author { name, type: "requester" | "staff" }, visibility, parentId, and attachments [{ id, url, fileName, fileSize }]. Internal notes are excluded upstream.
- Show only comments whose visibility is requester-visible (for example, "public"), plus the requester's own comments. Never guess visibility from author or body text. If visibility is missing, withhold staff comments and explain why in the UI rather than risk exposing an internal note.
- Requester comments are the only mutation. Validate 1–10,000 characters and POST to /tickets/{ticketId}/comments only after verifying ticket ownership.
- Never automatically retry a comment POST because there is no comment idempotency key. Preserve the text after failure and refresh the thread after success.
- Build threads with parentId. Nest visible replies beneath their parent using an indented connector line and order replies oldest to newest.
- Order top-level threads by the latest activity in each thread, newest first, so a new reply moves its thread to the top.
- If a reply's parent is hidden, render the reply as a top-level comment without referencing or revealing the hidden parent.
- Comment cards show: an initial avatar with distinct requester/support colours; author name; "(you)" for the requester's comments; a "Support team" badge for staff; a "replied" marker for nested replies; relative time with full date on hover; an "edited" marker; and a highlighted edge for the requester's comments.
- Render staff bodies as sanitized HTML and requester bodies as plain text.
- Show image attachments inside their visible support-team comment. Apply comment visibility before rendering or fetching attachments, so images from hidden/internal comments can never leak.
- Use only API-provided attachment URLs through an approved authenticated delivery path. Never expose the Portal API key or accept browser-supplied attachment URLs. Use short-lived signed URLs or a protected portal-server proxy when storage URLs are not safely public and tenant-scoped.
- Render safe raster images as constrained responsive thumbnails with preserved aspect ratio, file name, human-readable size, meaningful alt text, an accessible open/download action, and a keyboard-accessible larger preview.
- Lazy-load images and provide loading, unavailable, expired-link, and failure states without hiding the comment. Never render active formats such as SVG inline; show unsupported and non-image attachments as safe file links.
- Use an ordered list for the thread and label reply groups, for example "2 replies to Mahmud".
- Give the comment box a visible label and an aria-describedby character counter. Support Ctrl+Enter and Command+Enter to post. Announce success through role="status" and errors through role="alert".
- Full update history with actors, ticket-level attachments outside visible comments, escalated time, and elapsed duration are not in the current response. Do not fabricate them. Mark them as API-extension dependencies. Visible comment attachments are supported.

8. UI states and errors
- Provide accessible loading, empty, validation, submitting, success, unauthorized/not-found, and retry states.
- Map fieldErrors by field ID. Do not auto-retry 400/401/403/404/409/413/415. For 429 respect Retry-After. Retry transient network/500/503 failures with bounded exponential backoff and jitter only when safe, reusing the submission idempotency key. Never automatically retry a comment POST.
- Preserve form/comment text after recoverable errors without exposing credentials or raw upstream details.

9. Audit and data lifecycle
- After confirmed creation, write a portal audit event with actor user ID, tenant ID, timestamp, action, submission ID, ticket ID, and reference. Never log credentials, full answers, or comment bodies.
- Minimise personal data, show [PRIVACY NOTICE URL], and apply [RETENTION PERIOD] plus agreed access/deletion, hosting, and data-transfer rules to ownership links, drafts, idempotency records, caches, and audit data.

10. Resolve before production
- Complete issue-to-department mapping.
- Cross-system authentication and stable requester identity/email rules.
- Designated-tenant configuration and one key per tenant.
- Retention, data-access/deletion, hosting, and transfer arrangements.
- API support for history/actors, ticket-level attachments outside visible comments, escalation time, and duration if still required.

11. Tests and delivery
Test tenant gating; server-only secrets; every dynamic type (Short text, Rich text, Email, Number, Dropdown, Radio, Checkbox, Date, and File upload); options, nested options, required fields, conditional visibility, validation, value encoding, unknown-field fallback, and file-upload unavailable/uploading/success/failure states; routing issue ID; double-submit and retry deduplication; confirmation; own-user filtering; direct-ID denial; read-only controls; comment posting; 1–10,000 character limits; visibility filtering; internal-comment exclusion; reply threading, including a visible reply whose parent is hidden; visible support-comment image rendering and preview; attachment authorization; hidden-comment attachments never being requested or shown; broken, expired, unsupported, and non-image states; no automatic retry after comment failure; comment bodies and attachment URLs never appearing in logs; loading/empty/error/rate-limit states; session-derived identity; audit creation; and keyboard/screen-reader behaviour.

Deliver the implementation, tests, configuration notes, and dependency report. Explicitly identify acceptance criteria blocked by the API instead of creating misleading substitutes.`

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 sts-overlay-backdrop"
        onClick={onClose}
        aria-label="Close API documentation"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-api-doc-title"
        className="relative flex h-full w-full max-w-5xl flex-col border-l border-sts-card-border bg-sts-card shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-sts-card-border px-6 py-5 sm:px-8">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-sts-id/15 bg-sts-blue-tint text-sts-id">
              <BookOpen className="size-4" strokeWidth={1.9} />
            </span>
            <div>
              <h2 id="portal-api-doc-title" className="font-sans text-[20px] font-semibold tracking-[-0.025em] text-sts-foreground">
                Portal API documentation
              </h2>
              <p className="mt-1 max-w-2xl font-sans text-[12.5px] leading-relaxed text-sts-muted">
                Implement the tenant&apos;s support form, submission history, ticket view, and requester comments in another portal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sts-card-border text-sts-muted transition-colors hover:bg-sts-surface hover:text-sts-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30"
            aria-label="Close documentation"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[210px_minmax(0,1fr)]">
          <aside className="hidden border-r border-sts-card-border bg-sts-surface/35 px-5 py-6 md:block">
            <p className="mb-3 font-sans text-[10px] font-semibold tracking-[0.1em] text-sts-subtle uppercase">On this page</p>
            <nav className="flex flex-col gap-1 font-sans text-[12px]">
              {[
                ["overview", "How it works"],
                ["authentication", "Authentication"],
                ["endpoints", "Endpoints"],
                ["form", "Render the form"],
                ["submit", "Submit a request"],
                ["server", "Server example"],
                ["prompt", "Implementation prompt"],
                ["security", "Security"],
                ["limits", "Rate limits"],
              ].map(([id, label]) => (
                <a key={id} href={`#${id}`} className="rounded-md px-2 py-1.5 text-sts-muted transition-colors hover:bg-sts-card hover:text-sts-foreground">
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <main className="min-h-0 overflow-y-auto scroll-smooth px-6 py-7 sm:px-8 lg:px-10">
            <div className="mx-auto flex max-w-3xl flex-col gap-8">
              <DocSection id="overview" title="How it works">
                <p>
                  One API key is linked to one support form. The external portal never asks the requester to select a department or support form. It fetches the linked form, displays its issues and fields, and submits the selected issue ID.
                </p>
                <ol className="grid gap-2 sm:grid-cols-2">
                  {[
                    "Fetch the linked form definition.",
                    "Render issues and custom fields.",
                    "Submit the completed request.",
                    "Save the returned submission and ticket IDs.",
                    "Show the user's submissions and ticket.",
                    "Show staff replies and allow requester comments.",
                  ].map((item, index) => (
                    <li key={item} className="flex gap-2 rounded-lg bg-sts-surface/60 px-3 py-2.5">
                      <span className="font-mono text-[11px] text-sts-id">{String(index + 1).padStart(2, "0")}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </DocSection>

              <DocSection id="authentication" title="Authentication">
                <div className="flex items-start gap-3 rounded-xl border border-sts-card-border bg-sts-surface/45 p-4">
                  <Server className="mt-0.5 size-4 shrink-0 text-sts-id" />
                  <div>
                    <p className="font-semibold text-sts-foreground">Call the API from your server</p>
                    <p className="mt-1">Keep the key in a server-side secret store. Never place it in frontend JavaScript, HTML, URLs, local storage, analytics, or logs.</p>
                  </div>
                </div>
                <CodeBlock code={`Authorization: Bearer <api-key>\nAccept: application/json\nContent-Type: application/json  # requests with a body`} />
                <p>Use this base URL:</p>
                <CodeBlock code={baseUrl} />
              </DocSection>

              <DocSection id="endpoints" title="Endpoint reference">
                <div className="overflow-hidden rounded-xl border border-sts-card-border">
                  {ENDPOINTS.map(([method, route, purpose]) => (
                    <div key={`${method}-${route}`} className="grid gap-1 border-b border-sts-card-border px-4 py-3 last:border-0 sm:grid-cols-[54px_minmax(220px,1fr)_1fr] sm:items-center">
                      <span className="font-mono text-[10.5px] font-semibold text-sts-id">{method}</span>
                      <code className="font-mono text-[11.5px] text-sts-foreground">{route}</code>
                      <span className="text-[12px] text-sts-muted">{purpose}</span>
                    </div>
                  ))}
                </div>
              </DocSection>

              <DocSection id="form" title="Render the linked form">
                <CodeBlock code={formExample} />
                <p>The response contains:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li><code className="font-mono text-[11.5px] text-sts-foreground">defaultFields</code> for requester name, email, title, and issue type labels.</li>
                  <li><code className="font-mono text-[11.5px] text-sts-foreground">issues</code> with the IDs and labels shown to the requester.</li>
                  <li><code className="font-mono text-[11.5px] text-sts-foreground">fields</code> ordered custom fields, options, validation, and conditional visibility.</li>
                </ul>
                <p>
                  Do not hard-code field or issue IDs. Fetch the current form when the support page loads. The requester selects an issue; its configured department, sub-department, and SLA remain internal.
                </p>
              </DocSection>

              <DocSection id="submit" title="Submit a request">
                <CodeBlock code={submissionExample} />
                <p>
                  Required values are <code className="font-mono text-[11.5px] text-sts-foreground">submitterName</code>, a valid <code className="font-mono text-[11.5px] text-sts-foreground">submitterEmail</code>, an <code className="font-mono text-[11.5px] text-sts-foreground">issueId</code> from the current form, and the custom-field <code className="font-mono text-[11.5px] text-sts-foreground">responses</code> array.
                </p>
                <p>
                  Every custom value is a string. Send dates as <code className="font-mono text-[11.5px] text-sts-foreground">YYYY-MM-DD</code>, checkbox selections as comma-separated option values, and nested selections as <code className="font-mono text-[11.5px] text-sts-foreground">Parent &gt; Child</code>.
                </p>
                <div className="rounded-xl border border-sts-id/15 bg-sts-blue-tint/60 p-4 text-sts-foreground">
                  The <code className="font-mono text-[11.5px]">Idempotency-Key</code> header is required. Use one stable value per logical submission and reuse it when retrying a timed-out request. Database enforcement prevents duplicates even when identical requests arrive concurrently.
                </div>
                <CodeBlock code={`{
  "data": {
    "submissionId": "cmsubmission123",
    "ticketId": "cmticket123",
    "ticketReference": "IT-184"
  }
}`} />
              </DocSection>

              <DocSection id="server" title="Server-side JavaScript example">
                <CodeBlock code={serverExample} />
                <p>
                  Your browser should call authenticated routes on your own portal. Those routes derive the requester email from the signed-in session and proxy the request to this API.
                </p>
              </DocSection>

              <DocSection id="prompt" title="Copy-and-paste implementation prompt">
                <p>
                  Replace the bracketed values, then paste this into your coding assistant. It works for Next.js, PHP, Laravel, .NET, Java, or another server-side stack and includes the portal-side requirements and current API dependencies.
                </p>
                <CodeBlock code={implementationPrompt} />
              </DocSection>

              <DocSection id="security" title="Security and user ownership">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sts-foreground">
                    The API restricts data to the API key, but your portal must additionally restrict data to the signed-in requester.
                  </p>
                </div>
                <ul className="list-disc space-y-1.5 pl-5">
                  <li>Derive the requester email from your authenticated session; do not trust a browser-supplied email.</li>
                  <li>Store submission and ticket ownership in your portal database.</li>
                  <li>Verify ownership before proxying submission, ticket, or comment requests.</li>
                  <li>Escape API-provided text when rendering HTML and protect cookie-authenticated mutations against CSRF.</li>
                  <li>Use HTTPS, redact Authorization headers, apply per-user limits, and set outbound request timeouts.</li>
                  <li>Revoke the key immediately if it is exposed.</li>
                </ul>
                <p>External users can view tickets and add comments. They cannot change ticket status, priority, assignment, routing, or other ticket properties.</p>
              </DocSection>

              <DocSection id="limits" title="Rate limits and errors">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ["Form and ticket reads", "120 / minute"],
                    ["Submission history", "60 / minute"],
                    ["New submissions", "30 / minute"],
                    ["Requester comments", "60 / minute"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border border-sts-card-border px-3 py-2.5">
                      <span>{label}</span>
                      <span className="font-mono text-[11.5px] text-sts-foreground">{value}</span>
                    </div>
                  ))}
                </div>
                <p>
                  A limited request returns <code className="font-mono text-[11.5px] text-sts-foreground">429</code>. Wait for the <code className="font-mono text-[11.5px] text-sts-foreground">Retry-After</code> duration. Retry transient <code className="font-mono text-[11.5px] text-sts-foreground">500</code> or <code className="font-mono text-[11.5px] text-sts-foreground">503</code> responses with exponential backoff, but do not automatically retry validation or authentication errors.
                </p>
                <p>
                  Error responses use <code className="font-mono text-[11.5px] text-sts-foreground">{"{ \"error\": \"Message\" }"}</code>. Form validation errors also contain a <code className="font-mono text-[11.5px] text-sts-foreground">fieldErrors</code> object keyed by field ID.
                </p>
              </DocSection>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
