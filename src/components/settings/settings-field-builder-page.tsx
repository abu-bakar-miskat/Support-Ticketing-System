"use client"

import { useState, useRef, useTransition } from "react"
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronLeft,
  Type,
  AlignLeft,
  ChevronDown,
  Paperclip,
  Mail,
  Hash,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useRouter } from "next/navigation"
import { BreadcrumbRegistrar } from "@/components/dashboard/breadcrumb-registrar"

export type FieldRow = {
  id: string
  label: string
  type: "text" | "richtext" | "select" | "file" | "email" | "number"
  isRequired: boolean
  options: string[]
  childOptions: Record<string, string[]>
  order: number
}

const FIELD_TYPES: { value: FieldRow["type"]; label: string; icon: React.ReactNode }[] = [
  { value: "text", label: "Short text", icon: <Type className="size-3.5" /> },
  { value: "richtext", label: "Rich text", icon: <AlignLeft className="size-3.5" /> },
  { value: "email", label: "Email", icon: <Mail className="size-3.5" /> },
  { value: "number", label: "Number", icon: <Hash className="size-3.5" /> },
  { value: "select", label: "Dropdown", icon: <ChevronDown className="size-3.5" /> },
  { value: "file", label: "File upload", icon: <Paperclip className="size-3.5" /> },
]

function typeLabel(type: FieldRow["type"]) {
  return FIELD_TYPES.find((t) => t.value === type)?.label ?? type
}

function FieldTypeIcon({ type }: { type: FieldRow["type"] }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-pen-surface text-pen-muted">
      {FIELD_TYPES.find((t) => t.value === type)?.icon}
    </span>
  )
}

// ── Inline editor for add / edit ──────────────────────────────────────────────

type EditorState = {
  label: string
  type: FieldRow["type"]
  isRequired: boolean
  options: string[]
  childOptions: Record<string, string[]>
}

function FieldEditor({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: EditorState
  onSave: (s: EditorState) => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [state, setState] = useState<EditorState>(initial)
  const [newOption, setNewOption] = useState("")
  const [expandedOption, setExpandedOption] = useState<string | null>(null)
  const [newChild, setNewChild] = useState("")
  const [editingChild, setEditingChild] = useState<{ parent: string; idx: number; draft: string } | null>(null)
  const [editingOption, setEditingOption] = useState<{ idx: number; draft: string } | null>(null)

  function addOption() {
    const trimmed = newOption.trim()
    if (!trimmed || state.options.includes(trimmed)) return
    setState((s) => ({ ...s, options: [...s.options, trimmed] }))
    setNewOption("")
  }

  function removeOption(opt: string) {
    setState((s) => {
      const childOptions = { ...s.childOptions }
      delete childOptions[opt]
      return { ...s, options: s.options.filter((o) => o !== opt), childOptions }
    })
    if (expandedOption === opt) setExpandedOption(null)
  }

  function addChild(parent: string) {
    const trimmed = newChild.trim()
    if (!trimmed) return
    const existing = state.childOptions[parent] ?? []
    if (existing.includes(trimmed)) return
    setState((s) => ({
      ...s,
      childOptions: { ...s.childOptions, [parent]: [...existing, trimmed] },
    }))
    setNewChild("")
  }

  function removeChild(parent: string, child: string) {
    setState((s) => ({
      ...s,
      childOptions: {
        ...s.childOptions,
        [parent]: (s.childOptions[parent] ?? []).filter((c) => c !== child),
      },
    }))
  }

  function confirmEditOption() {
    if (!editingOption) return
    const { idx, draft } = editingOption
    const trimmed = draft.trim()
    if (trimmed) {
      setState((s) => {
        const options = [...s.options]
        const oldVal = options[idx]
        options[idx] = trimmed
        // rename childOptions key if it existed
        const childOptions = { ...s.childOptions }
        if (oldVal in childOptions) {
          childOptions[trimmed] = childOptions[oldVal]
          delete childOptions[oldVal]
        }
        return { ...s, options, childOptions }
      })
      if (expandedOption === state.options[idx]) setExpandedOption(trimmed)
    }
    setEditingOption(null)
  }

  function confirmEditChild() {
    if (!editingChild) return
    const { parent, idx, draft } = editingChild
    const trimmed = draft.trim()
    if (trimmed) {
      setState((s) => {
        const children = [...(s.childOptions[parent] ?? [])]
        children[idx] = trimmed
        return { ...s, childOptions: { ...s.childOptions, [parent]: children } }
      })
    }
    setEditingChild(null)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-pen-card-border bg-pen-card px-4 py-3.5">
      {/* Label */}
      <div className="flex flex-col gap-1">
        <label className="font-sans text-[11.5px] font-medium text-pen-subtle uppercase tracking-wide">
          Label
        </label>
        <input
          autoFocus
          value={state.label}
          onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))}
          placeholder="e.g. Full name"
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(state)
            if (e.key === "Escape") onCancel()
          }}
          className="h-8 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[12.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
        />
      </div>

      {/* Type selector */}
      <div className="flex flex-col gap-1">
        <label className="font-sans text-[11.5px] font-medium text-pen-subtle uppercase tracking-wide">
          Type
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FIELD_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setState((s) => ({ ...s, type: t.value, options: [], childOptions: {} }))}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-sans text-[11.5px] font-medium transition-colors",
                state.type === t.value
                  ? "border-pen-id bg-pen-blue-tint font-semibold text-pen-id"
                  : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options editor — only for select */}
      {state.type === "select" && (
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11.5px] font-medium text-pen-subtle uppercase tracking-wide">
            Options
          </label>

          {/* Option rows */}
          <div className="flex flex-col gap-1">
            {state.options.map((opt, idx) => {
              const children = state.childOptions[opt] ?? []
              const isOpen = expandedOption === opt
              const isEditingOpt = editingOption?.idx === idx
              return (
                <div key={opt} className="rounded-lg border border-pen-card-border bg-pen-surface">
                  {/* Option row */}
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    {isEditingOpt ? (
                      <>
                        <input
                          autoFocus
                          value={editingOption.draft}
                          onChange={(e) => setEditingOption({ ...editingOption, draft: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); confirmEditOption() }
                            if (e.key === "Escape") setEditingOption(null)
                          }}
                          className="h-6 min-w-0 flex-1 rounded-md border border-pen-id bg-pen-card px-2 font-sans text-[12px] text-pen-foreground outline-none"
                        />
                        <button type="button" onClick={confirmEditOption} className="flex h-6 items-center justify-center rounded-md bg-pen-blue px-2 text-white">
                          <Check className="size-3" />
                        </button>
                        <button type="button" onClick={() => setEditingOption(null)} className="flex h-6 items-center justify-center rounded-md border border-pen-card-border px-2 text-pen-subtle hover:text-pen-foreground">
                          <X className="size-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 font-sans text-[12px] text-pen-foreground">{opt}</span>
                        <button
                          type="button"
                          onClick={() => setExpandedOption(isOpen ? null : opt)}
                          className={cn(
                            "flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[10.5px] transition-colors",
                            isOpen
                              ? "bg-pen-blue-tint text-pen-id"
                              : "text-pen-subtle hover:text-pen-foreground",
                          )}
                        >
                          <ChevronDown className={cn("size-3 transition-transform", isOpen && "rotate-180")} />
                          {children.length > 0 ? `${children.length} sub-option${children.length !== 1 ? "s" : ""}` : "Sub-options"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingOption({ idx, draft: opt })}
                          className="text-pen-subtle hover:text-pen-foreground"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOption(opt)}
                          className="text-pen-subtle hover:text-pen-red"
                        >
                          <X className="size-3" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Child options panel */}
                  {isOpen && (
                    <div className="border-t border-pen-card-border px-2.5 py-2 flex flex-col gap-1.5">
                      {children.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {children.map((child, idx) => {
                            const isEditingThis = editingChild?.parent === opt && editingChild?.idx === idx
                            return isEditingThis ? (
                              <div key={child} className="flex gap-1.5">
                                <input
                                  autoFocus
                                  value={editingChild.draft}
                                  onChange={(e) => setEditingChild({ ...editingChild, draft: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); confirmEditChild() }
                                    if (e.key === "Escape") setEditingChild(null)
                                  }}
                                  className="h-6 min-w-0 flex-1 rounded-md border border-pen-id bg-pen-card px-2 font-sans text-[11.5px] text-pen-foreground outline-none"
                                />
                                <button type="button" onClick={confirmEditChild} className="flex h-6 items-center justify-center rounded-md bg-pen-blue px-2 text-white">
                                  <Check className="size-2.5" />
                                </button>
                                <button type="button" onClick={() => setEditingChild(null)} className="flex h-6 items-center justify-center rounded-md border border-pen-card-border px-2 text-pen-subtle hover:text-pen-foreground">
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            ) : (
                              <div key={child} className="flex items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-card px-2 py-1">
                                <span className="flex-1 font-sans text-[11px] text-pen-foreground">{child}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingChild({ parent: opt, idx, draft: child })}
                                  className="text-pen-subtle hover:text-pen-foreground"
                                >
                                  <Pencil className="size-2.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeChild(opt, child)}
                                  className="text-pen-subtle hover:text-pen-red"
                                >
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          value={newChild}
                          onChange={(e) => setNewChild(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addChild(opt) }
                          }}
                          placeholder={`Add sub-option for "${opt}"…`}
                          className="h-6 min-w-0 flex-1 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[11.5px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
                        />
                        <button
                          type="button"
                          onClick={() => addChild(opt)}
                          className="flex h-6 items-center gap-1 rounded-md border border-pen-card-border bg-pen-card px-2 font-sans text-[11px] text-pen-muted hover:text-pen-foreground"
                        >
                          <Plus className="size-2.5" />
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add new option */}
          <div className="flex gap-1.5">
            <input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addOption() }
              }}
              placeholder="Add option…"
              className="h-7 min-w-0 flex-1 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id"
            />
            <button
              type="button"
              onClick={addOption}
              className="flex h-7 items-center gap-1 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
            >
              <Plus className="size-3" />
              Add
            </button>
          </div>
        </div>
      )}

      {/* Required toggle */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={state.isRequired}
          onChange={(e) => setState((s) => ({ ...s, isRequired: e.target.checked }))}
          className="size-3.5 rounded accent-pen-blue"
        />
        <span className="font-sans text-[12px] text-pen-foreground">Required</span>
      </label>

      {error && <p className="font-sans text-[11.5px] text-pen-red">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 items-center gap-1 rounded-lg px-3 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(state)}
          disabled={saving}
          className="flex h-7 items-center gap-1 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white hover:bg-pen-blue/90 disabled:opacity-50 dark:text-gray-900"
        >
          <Check className="size-3" />
          {saving ? "Saving…" : "Save field"}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsFieldBuilderPage({
  formId,
  formName,
  departmentName,
  fields: initialFields,
}: {
  formId: string
  formName: string
  departmentName: string
  fields: FieldRow[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [fields, setFields] = useState<FieldRow[]>(
    [...initialFields].sort((a, b) => a.order - b.order),
  )
  const [addingField, setAddingField] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FieldRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)

  // Drag state
  const dragId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // ── Drag reorder ────────────────────────────────────────────────────────────

  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromIdx = fields.findIndex((f) => f.id === fromId)
    const toIdx = fields.findIndex((f) => f.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...fields]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const withOrders = reordered.map((f, i) => ({ ...f, order: i }))
    setFields(withOrders)

    await fetch(`/api/intake/forms/${formId}/fields/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldIds: withOrders.map((f) => f.id) }),
    }).catch(() => null)
  }

  // ── Add field ───────────────────────────────────────────────────────────────

  async function handleAdd(state: EditorState) {
    if (!state.label.trim()) {
      setEditorError("Label is required.")
      return
    }
    setSaving(true)
    setEditorError(null)
    try {
      const res = await fetch(`/api/intake/forms/${formId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEditorError((data as { error?: string }).error ?? "Failed to add field.")
        return
      }
      const field: FieldRow = await res.json()
      setFields((prev) => [...prev, field])
      setAddingField(false)
    } finally {
      setSaving(false)
    }
  }

  // ── Edit field ──────────────────────────────────────────────────────────────

  async function handleEdit(fieldId: string, state: EditorState) {
    if (!state.label.trim()) {
      setEditorError("Label is required.")
      return
    }
    setSaving(true)
    setEditorError(null)
    try {
      const res = await fetch(`/api/intake/forms/${formId}/fields/${fieldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEditorError((data as { error?: string }).error ?? "Failed to update field.")
        return
      }
      const updated: FieldRow = await res.json()
      setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...updated, order: f.order } : f)))
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete field ────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/intake/forms/${formId}/fields/${deleteTarget.id}`, {
      method: "DELETE",
    })
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== deleteTarget.id))
      setDeleteTarget(null)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-8 sm:px-8 lg:px-10 lg:py-8">
      <BreadcrumbRegistrar
        crumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Support forms", href: "/settings/intake-forms" },
          { label: formName, href: `/settings/intake-forms/${formId}` },
        ]}
      />
      {/* Header */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => startTransition(() => router.push("/settings/intake-forms"))}
          className="flex w-fit items-center gap-1 font-sans text-[11.5px] text-pen-muted hover:text-pen-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Support forms
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="pen-text-admin-title">
              {formName}
            </h1>
            <p className="mt-[3px] font-sans text-[13px] text-pen-muted">{departmentName}</p>
          </div>
          <Button
            onClick={() => {
              setAddingField(true)
              setEditingId(null)
              setEditorError(null)
            }}
            className="h-[34px] shrink-0 gap-1.5 rounded-[7px] bg-pen-blue px-4 font-sans text-xs font-medium text-white dark:text-gray-900 hover:bg-pen-blue/90"
          >
            <Plus className="size-[13px]" strokeWidth={2.5} />
            Add field
          </Button>
        </div>
      </div>

      {/* Field list */}
      <div className="flex flex-col gap-2">
        {fields.length === 0 && !addingField && (
          <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-pen-card-border py-12 text-center">
            <p className="font-sans text-[13px] text-pen-muted">No fields yet.</p>
            <p className="mt-1 font-sans text-[12px] text-pen-subtle">
              Add fields to define what submitters will fill in.
            </p>
          </div>
        )}

        {fields.map((field) => {
          const isDragOver = dragOverId === field.id
          const isEditing = editingId === field.id

          if (isEditing) {
            return (
              <FieldEditor
                key={field.id}
                initial={{
                  label: field.label,
                  type: field.type,
                  isRequired: field.isRequired,
                  options: field.options,
                  childOptions: field.childOptions ?? {},
                }}
                onSave={(state) => handleEdit(field.id, state)}
                onCancel={() => { setEditingId(null); setEditorError(null) }}
                saving={saving}
                error={editorError}
              />
            )
          }

          return (
            <div
              key={field.id}
              draggable
              onDragStart={() => { dragId.current = field.id }}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(field.id) }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={() => {
                setDragOverId(null)
                if (dragId.current) reorder(dragId.current, field.id)
                dragId.current = null
              }}
              onDragEnd={() => { dragId.current = null; setDragOverId(null) }}
              className={cn(
                "group flex items-center gap-3 rounded-xl border border-pen-card-border bg-pen-card px-3 py-2.5 transition-colors",
                isDragOver && "border-pen-id bg-pen-blue-tint",
              )}
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-pen-subtle opacity-30 group-hover:opacity-70 active:cursor-grabbing" />
              <FieldTypeIcon type={field.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[12.5px] font-semibold text-pen-foreground">
                  {field.label}
                  {field.isRequired && (
                    <span className="ml-1 text-pen-red">*</span>
                  )}
                </p>
                <p className="font-sans text-[11.5px] text-pen-subtle">
                  {typeLabel(field.type)}
                  {field.type === "select" && field.options.length > 0 && (
                    <> · {field.options.length} option{field.options.length !== 1 ? "s" : ""}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-0.5 transition-opacity">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(field.id)
                    setAddingField(false)
                    setEditorError(null)
                  }}
                  className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(field)}
                  className="flex size-7 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-red"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          )
        })}

        {/* Add new field editor — appended below the list */}
        {addingField && (
          <FieldEditor
            initial={{ label: "", type: "text", isRequired: false, options: [], childOptions: {} }}
            onSave={handleAdd}
            onCancel={() => { setAddingField(false); setEditorError(null) }}
            saving={saving}
            error={editorError}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Delete field?"
        description={`"${deleteTarget?.label}" will be permanently removed from this form.`}
        confirmLabel="Delete"
        successMessage="Field deleted."
        onConfirm={handleDelete}
      />
    </div>
  )
}
