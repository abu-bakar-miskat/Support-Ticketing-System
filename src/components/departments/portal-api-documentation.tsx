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
                    "Allow requester comments only.",
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
                  Use one stable <code className="font-mono text-[11.5px]">Idempotency-Key</code> per logical submission. Reuse it when retrying a timed-out request so a second ticket is not created.
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
