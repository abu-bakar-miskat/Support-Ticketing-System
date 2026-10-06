"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  FileInput,
  Inbox,
  KeyRound,
  ListChecks,
  Settings2,
  Trash2,
} from "lucide-react"
import {
  FieldBuilderModal,
  IssuesModal,
  type FormEditorTarget,
  type IssueDepartmentOption,
} from "@/components/settings/settings-intake-forms-page"
import type { ResolvedDefaultFields } from "@/lib/intake-default-fields"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PortalSubmissionsModal } from "@/components/departments/portal-submissions-modal"

export type PortalApiFormRow = {
  apiKeyId: string
  form: FormEditorTarget
  defaultFields: ResolvedDefaultFields
  intakeCount: number
  departments: IssueDepartmentOption[]
}

export type PortalApiConnectionRow = {
  id: string
  name: string
  maskedKey: string
  department: string
  lastUsed: string
  revoked: boolean
}

export function PortalApiFormsSection({
  apiKeys,
  forms,
  revokingId,
  onRevoke,
  onRestore,
  onDelete,
}: {
  apiKeys: PortalApiConnectionRow[]
  forms: PortalApiFormRow[]
  revokingId: string | null
  onRevoke: (id: string) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => Promise<void>
}) {
  const router = useRouter()
  const [fieldTarget, setFieldTarget] = useState<PortalApiFormRow | null>(null)
  const [issueTarget, setIssueTarget] = useState<PortalApiFormRow | null>(null)
  const [submissionsTarget, setSubmissionsTarget] = useState<PortalApiFormRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PortalApiConnectionRow | null>(null)
  const formsByKey = useMemo(
    () => new Map(forms.map((row) => [row.apiKeyId, row])),
    [forms],
  )
  const activeCount = apiKeys.filter((key) => !key.revoked).length

  return (
    <section
      aria-labelledby="portal-connections-title"
      className="overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-[0_14px_40px_-32px_rgba(74,44,35,0.45)]"
    >
      <header className="flex items-center justify-between gap-4 border-b border-sts-card-border px-5 py-4 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="portal-connections-title" className="font-sans text-[15px] font-semibold tracking-[-0.01em] text-sts-foreground">
              Portal connections
            </h2>
            <span className="font-mono text-[11px] tabular-nums text-sts-subtle">
              {activeCount} active
            </span>
          </div>
          <p className="mt-0.5 max-w-2xl font-sans text-[12px] leading-relaxed text-sts-muted">
            Each key controls one support form. Configure its questions, routing issues, and SLA targets here.
          </p>
        </div>
      </header>

      {apiKeys.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-sts-surface text-sts-muted">
            <KeyRound className="size-4" strokeWidth={1.8} />
          </span>
          <p className="mt-3 font-sans text-[13px] font-semibold text-sts-foreground">No portal connections yet</p>
          <p className="mt-1 max-w-sm font-sans text-[12px] leading-relaxed text-sts-muted">
            Generate a key to create its dedicated support form.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-sts-card-border">
          {apiKeys.map((apiKey) => {
            const linkedForm = formsByKey.get(apiKey.id)
            return (
              <article
                key={apiKey.id}
                className={cn(
                  "group/connection transition-colors duration-200",
                  apiKey.revoked ? "bg-sts-surface/35 opacity-65" : "hover:bg-sts-bg/25",
                )}
              >
                <div className="grid gap-4 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(15rem,1.35fr)_minmax(12rem,0.9fr)_minmax(8rem,0.55fr)_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-[10px] border",
                      apiKey.revoked
                        ? "border-sts-card-border bg-sts-surface text-sts-subtle"
                        : "border-sts-id/15 bg-sts-blue-tint text-sts-id",
                    )}>
                      <KeyRound className="size-4" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-sans text-[13px] font-semibold text-sts-foreground">
                          {apiKey.name}
                        </h3>
                        {apiKey.revoked && (
                          <span className="font-sans text-[10.5px] font-medium text-sts-subtle">Revoked</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate font-sans text-[11.5px] text-sts-muted">
                        {apiKey.department}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0 lg:border-l lg:border-sts-card-border lg:pl-5">
                    <p className="font-sans text-[10px] font-semibold tracking-[0.08em] text-sts-subtle uppercase">API key</p>
                    <code className="mt-1 block truncate font-mono text-[11.5px] text-sts-muted">{apiKey.maskedKey}</code>
                  </div>

                  <div className="lg:border-l lg:border-sts-card-border lg:pl-5">
                    <p className="font-sans text-[10px] font-semibold tracking-[0.08em] text-sts-subtle uppercase">Last used</p>
                    <p className="mt-1 font-mono text-[11.5px] tabular-nums text-sts-muted">{apiKey.lastUsed}</p>
                  </div>

                  <div className="flex items-center justify-start gap-1 lg:justify-end">
                    {!apiKey.revoked && (
                      <button
                        type="button"
                        disabled={revokingId === apiKey.id}
                        onClick={() => onRevoke(apiKey.id)}
                        className="rounded-md px-2 py-1 font-sans text-[11.5px] font-medium text-sts-red transition-colors hover:bg-red-500/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-red/30 active:translate-y-px disabled:opacity-50"
                      >
                        {revokingId === apiKey.id ? "Revoking…" : "Revoke"}
                      </button>
                    )}
                    {apiKey.revoked && (
                      <button
                        type="button"
                        disabled={revokingId === apiKey.id}
                        onClick={() => onRestore(apiKey.id)}
                        className="rounded-md px-2 py-1 font-sans text-[11.5px] font-medium text-sts-id transition-colors hover:bg-sts-blue-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30 active:translate-y-px disabled:opacity-50"
                      >
                        {revokingId === apiKey.id ? "Restoring…" : "Restore"}
                      </button>
                    )}
                    {apiKey.revoked && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(apiKey)}
                        className="inline-flex size-7 items-center justify-center rounded-md text-sts-subtle transition-colors hover:bg-red-500/8 hover:text-sts-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-red/30 active:translate-y-px"
                        aria-label={`Delete ${apiKey.name}`}
                        title="Delete connection"
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                </div>

                {!apiKey.revoked && linkedForm && (
                  <div className="mx-5 mb-4 flex flex-col gap-3 rounded-[10px] border border-sts-card-border/80 bg-sts-surface/55 px-4 py-3 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sts-card text-sts-muted shadow-sm ring-1 ring-sts-card-border/70">
                        <FileInput className="size-3.5" strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-sans text-[10px] font-semibold tracking-[0.08em] text-sts-subtle uppercase">Linked support form</p>
                        <p className="mt-0.5 truncate font-sans text-[12.5px] font-semibold text-sts-foreground">
                          {linkedForm.form.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      {linkedForm.intakeCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setSubmissionsTarget(linkedForm)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-sans text-[11.5px] font-medium text-sts-muted transition-colors hover:bg-sts-card hover:text-sts-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30 active:translate-y-px"
                        >
                          <Inbox className="size-3.5" strokeWidth={1.8} />
                          {linkedForm.intakeCount} submission{linkedForm.intakeCount === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <span className="inline-flex h-8 items-center gap-1.5 px-2.5 font-sans text-[11.5px] text-sts-subtle">
                          <Inbox className="size-3.5" strokeWidth={1.8} />
                          No submissions
                        </span>
                      )}
                      <span className="mx-1 hidden h-4 w-px bg-sts-card-border sm:block" aria-hidden />
                      <button
                        type="button"
                        onClick={() => setIssueTarget(linkedForm)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-sts-card-border bg-sts-card px-3 font-sans text-[11.5px] font-semibold text-sts-foreground shadow-sm transition-all duration-200 hover:border-sts-id/35 hover:text-sts-id focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30 active:translate-y-px"
                      >
                        <ListChecks className="size-3.5" strokeWidth={1.8} />
                        Issues &amp; SLA
                      </button>
                      <button
                        type="button"
                        onClick={() => setFieldTarget(linkedForm)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sts-blue px-3 font-sans text-[11.5px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-sts-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/40 active:translate-y-px dark:text-gray-900"
                      >
                        <Settings2 className="size-3.5" strokeWidth={1.8} />
                        Form fields
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {fieldTarget && (
        <FieldBuilderModal
          form={fieldTarget.form}
          defaultFields={fieldTarget.defaultFields}
          onClose={() => setFieldTarget(null)}
        />
      )}

      {submissionsTarget && (
        <PortalSubmissionsModal
          apiKeyId={submissionsTarget.apiKeyId}
          formName={submissionsTarget.form.name}
          onClose={() => setSubmissionsTarget(null)}
        />
      )}

      {issueTarget && (
        <IssuesModal
          form={issueTarget.form}
          subDepartments={[]}
          issueDepartments={issueTarget.departments}
          issuesEndpoint={`/api/settings/api-keys/${issueTarget.apiKeyId}/issues`}
          onClose={() => {
            setIssueTarget(null)
            router.refresh()
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete API connection?"
        description={`This permanently deletes “${deleteTarget?.name ?? "this connection"}”, its API key, and its linked support form. Connections with submission history must be revoked instead.`}
        confirmLabel="Delete connection"
        successMessage="API connection deleted."
        onConfirm={async () => {
          if (!deleteTarget) return
          await onDelete(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </section>
  )
}
