"use client"

import { useMemo, useState } from "react"
import {
  FileInput,
  Inbox,
  KeyRound,
  Pencil,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Tip } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PortalSubmissionsModal } from "@/components/departments/portal-submissions-modal"
import { ListSearchInput, SortDropdown, byNumberDesc, byText, useListControls } from "@/components/ui/list-controls"

export type PortalApiFormRow = {
  apiKeyId: string
  form: {
    id: string
    name: string
    departmentName: string
  }
  intakeCount: number
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
  onEdit,
}: {
  apiKeys: PortalApiConnectionRow[]
  forms: PortalApiFormRow[]
  revokingId: string | null
  onRevoke: (id: string) => void
  onRestore: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onEdit: (id: string) => void
}) {
  const [submissionsTarget, setSubmissionsTarget] = useState<PortalApiFormRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PortalApiConnectionRow | null>(null)
  // Submissions deleted from the modal this session, per key — keeps the
  // card counts current without a server round-trip.
  const [deletedCounts, setDeletedCounts] = useState<Record<string, number>>({})
  const formsByKey = useMemo(
    () => new Map(forms.map((row) => [
      row.apiKeyId,
      { ...row, intakeCount: Math.max(0, row.intakeCount - (deletedCounts[row.apiKeyId] ?? 0)) },
    ])),
    [forms, deletedCounts],
  )
  const activeCount = apiKeys.filter((key) => !key.revoked).length
  const list = useListControls(apiKeys, {
    searchText: (k) => {
      const linked = formsByKey.get(k.id)
      return `${k.name} ${k.maskedKey} ${k.department} ${linked?.form.name ?? ""} ${linked?.form.departmentName ?? ""}`
    },
    sortOptions: [
      // Server order: newest first, revoked last.
      { id: "newest", label: "Newest first", compare: () => 0 },
      { id: "name", label: "Name A–Z", compare: byText((k: PortalApiConnectionRow) => k.name) },
      { id: "name-desc", label: "Name Z–A", compare: (a, b) => byText((k: PortalApiConnectionRow) => k.name)(b, a) },
      { id: "department", label: "Department", compare: byText((k: PortalApiConnectionRow) => k.department) },
      {
        id: "submissions",
        label: "Most submissions",
        compare: byNumberDesc((k: PortalApiConnectionRow) => formsByKey.get(k.id)?.intakeCount ?? 0),
      },
      { id: "status", label: "Active first", compare: (a, b) => Number(a.revoked) - Number(b.revoked) },
    ],
  })

  return (
    <section
      aria-labelledby="portal-connections-title"
      className="overflow-hidden rounded-xl border border-sts-card-border bg-sts-card shadow-[0_14px_40px_-32px_rgba(74,44,35,0.45)]"
    >
      <header className="flex flex-col gap-3 border-b sm:flex-row sm:items-center sm:justify-between sm:gap-4 border-sts-card-border px-5 py-4 sm:px-6">
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
            Each key connects an external portal to one existing support form.
          </p>
        </div>
        {apiKeys.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <ListSearchInput value={list.query} onChange={list.setQuery} placeholder="Search connections…" />
            <SortDropdown value={list.sortKey} onChange={list.setSortKey} options={list.sortDropdownOptions} />
          </div>
        )}
      </header>

      {apiKeys.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-sts-surface text-sts-muted">
            <KeyRound className="size-4" strokeWidth={1.8} />
          </span>
          <p className="mt-3 font-sans text-[13px] font-semibold text-sts-foreground">No portal connections yet</p>
          <p className="mt-1 max-w-sm font-sans text-[12px] leading-relaxed text-sts-muted">
            Generate a key and connect it to an existing support form.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-sts-card-border">
          {list.visible.length === 0 && (
            <p className="px-6 py-10 text-center font-sans text-[12.5px] text-sts-muted">
              No connections match &ldquo;{list.query.trim()}&rdquo;.
            </p>
          )}
          {list.visible.map((apiKey) => {
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
                    <button
                      type="button"
                      onClick={() => onEdit(apiKey.id)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[11.5px] font-medium text-sts-id hover:bg-sts-blue-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-id/30"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit linked form
                    </button>
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
                      <Tip label="Delete connection">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(apiKey)}
                          className="inline-flex size-7 items-center justify-center rounded-md text-sts-subtle transition-colors hover:bg-red-500/8 hover:text-sts-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sts-red/30 active:translate-y-px"
                          aria-label={`Delete ${apiKey.name}`}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.8} />
                        </button>
                      </Tip>
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
                        <p className="mt-0.5 truncate font-sans text-[11px] text-sts-muted">
                          {linkedForm.form.departmentName}
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
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {submissionsTarget && (
        <PortalSubmissionsModal
          apiKeyId={submissionsTarget.apiKeyId}
          formName={submissionsTarget.form.name}
          onClose={() => setSubmissionsTarget(null)}
          onDeleted={() => {
            const keyId = submissionsTarget.apiKeyId
            setDeletedCounts((prev) => ({ ...prev, [keyId]: (prev[keyId] ?? 0) + 1 }))
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete API connection?"
        description={`This permanently deletes “${deleteTarget?.name ?? "this connection"}” and its API key. The linked support form will not be deleted. Connections with API submission history must remain revoked instead.`}
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
