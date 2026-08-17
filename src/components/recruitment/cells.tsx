"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ExternalLink, Loader2, Paperclip, Plus, Star, Upload, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { parseFileValue, parseOptions, type FileCellValue, type SelectOption } from "@/lib/recruitment"
import type { RecruitmentFieldType } from "@/generated/prisma/enums"

export type Field = {
  id: string
  name: string
  type: RecruitmentFieldType
  options: unknown
  order: number
  hidden: boolean
}

export type Candidate = {
  id: string
  values: Record<string, unknown>
  order: number
  createdAt: string
}

export const CHIP_CLASSES: Record<string, string> = {
  gray: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  yellow: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  red: "bg-red-500/15 text-red-600 dark:text-red-300",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
}

export const CHIP_DOT_CLASSES: Record<string, string> = {
  gray: "bg-zinc-400",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  yellow: "bg-yellow-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
}

export function Chip({ option, className }: { option: SelectOption; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-xs font-medium",
        CHIP_CLASSES[option.color] ?? CHIP_CLASSES.gray,
        className,
      )}
    >
      {option.label}
    </span>
  )
}

function linkHref(type: RecruitmentFieldType, value: string): string | null {
  if (type === "url") return value.startsWith("http") ? value : `https://${value}`
  if (type === "email") return `mailto:${value}`
  if (type === "phone") return `tel:${value.replace(/\s+/g, "")}`
  return null
}

type CellProps = {
  field: Field
  value: unknown
  onChange: (value: unknown) => void
  /** For select/multi_select: create a new option with this label, then apply it. */
  onCreateOption?: (label: string) => void
  /** For file cells: upload and return the stored value, or null on failure (caller reports). */
  onUploadFile?: (file: File) => Promise<FileCellValue | null>
  /** For file cells: best-effort removal of a replaced/cleared storage object. */
  onDeleteFile?: (path: string) => void
}

/**
 * Plain-text cells open an expanded popover editor instead of the one-line
 * inline input — the AI columns (Highlights, Concerns / Gaps) hold sentences,
 * and a truncated cell was otherwise unreadable.
 */
function LongTextCell({ value, onChange }: CellProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const draftRef = useRef("")
  const cancelledRef = useRef(false)
  const current = typeof value === "string" ? value : ""

  function handleOpenChange(next: boolean) {
    if (next) {
      cancelledRef.current = false
      draftRef.current = current
      setDraft(current)
    } else if (!cancelledRef.current && draftRef.current !== current) {
      onChange(draftRef.current.trim() || null)
    }
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger className="flex min-h-5 w-full cursor-text items-center text-left outline-none">
        <span className="truncate text-sm">{current}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[90vw] p-2">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => {
            draftRef.current = e.target.value
            setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              cancelledRef.current = true
              setOpen(false)
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleOpenChange(false)
          }}
          rows={Math.min(12, Math.max(4, Math.ceil((draft.length || 1) / 48)))}
          className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
        />
        <div className="mt-1 text-[10px] text-muted-foreground">
          Click away to save · Esc to cancel
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TextishCell({ field, value, onChange }: CellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const current = typeof value === "string" ? value : ""

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          if (draft !== current) onChange(draft || null)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            setDraft(current)
            setEditing(false)
          }
        }}
        type={field.type === "number" ? "number" : "text"}
        className="w-full min-w-0 bg-transparent text-sm outline-none"
      />
    )
  }

  const href = current ? linkHref(field.type, current) : null
  return (
    <div
      className="group/cell flex min-h-5 w-full cursor-text items-center gap-1"
      onClick={() => {
        setDraft(current)
        setEditing(true)
      }}
    >
      <span className="truncate text-sm">{current}</span>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover/cell:visible"
          title={current}
        >
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  )
}

function NumberCell(props: CellProps) {
  const num = typeof props.value === "number" ? props.value : null
  return (
    <TextishCell
      {...props}
      value={num === null ? "" : String(num)}
      onChange={(v) => props.onChange(v === null ? null : Number(v))}
    />
  )
}

function DateCell({ value, onChange }: CellProps) {
  const [open, setOpen] = useState(false)
  const current = typeof value === "string" ? value : ""
  const display = current
    ? new Date(`${current}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : ""
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex min-h-5 w-full items-center text-left outline-none">
        {display ? (
          <span className="truncate text-sm">{display}</span>
        ) : (
          <span className="text-sm text-transparent">·</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={current}
            onChange={(e) => {
              onChange(e.target.value || null)
              if (e.target.value) setOpen(false)
            }}
            className="rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
          {current && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Clear date"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CheckboxCell({ value, onChange }: CellProps) {
  return (
    <input
      type="checkbox"
      checked={value === true}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 cursor-pointer accent-primary"
    />
  )
}

function RatingCell({ value, onChange }: CellProps) {
  const rating = typeof value === "number" ? value : 0
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i === rating ? null : i)}
          className="rounded p-px text-muted-foreground/40 hover:text-yellow-500"
          title={`${i} star${i > 1 ? "s" : ""}`}
        >
          <Star className={cn("size-3.5", i <= rating && "fill-yellow-500 text-yellow-500")} />
        </button>
      ))}
    </div>
  )
}

function OptionMenu({
  field,
  selectedIds,
  onToggle,
  onClear,
  onCreateOption,
  triggerClassName,
  children,
}: {
  field: Field
  selectedIds: string[]
  onToggle: (id: string) => void
  onClear: () => void
  onCreateOption?: (label: string) => void
  triggerClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const options = parseOptions(field.options)
  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options
  const exactMatch = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase())

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery("") }}>
      <PopoverTrigger className={triggerClassName}>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or create…"
          className="mb-1 w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim() && !exactMatch && onCreateOption) {
              onCreateOption(query.trim())
              setQuery("")
              setOpen(false)
            }
          }}
        />
        <div className="max-h-56 overflow-y-auto">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onToggle(o.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <Chip option={o} />
              {selectedIds.includes(o.id) && <Check className="size-3.5 shrink-0 text-primary" />}
            </button>
          ))}
          {query.trim() && !exactMatch && onCreateOption && (
            <button
              type="button"
              onClick={() => {
                onCreateOption(query.trim())
                setQuery("")
                setOpen(false)
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              <Plus className="size-3.5" /> Create “{query.trim()}”
            </button>
          )}
        </div>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => { onClear(); setOpen(false) }}
            className="mt-1 flex w-full items-center gap-1.5 rounded-md border-t border-border px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
          >
            <X className="size-3.5" /> Clear
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function SelectCell({ field, value, onChange, onCreateOption }: CellProps) {
  const options = parseOptions(field.options)
  const selected = typeof value === "string" ? options.find((o) => o.id === value) : undefined
  return (
    <OptionMenu
      field={field}
      selectedIds={selected ? [selected.id] : []}
      onToggle={(id) => onChange(id === value ? null : id)}
      onClear={() => onChange(null)}
      onCreateOption={onCreateOption}
      triggerClassName="flex min-h-5 w-full items-center text-left outline-none"
    >
      {selected ? <Chip option={selected} /> : <span className="text-sm text-transparent">·</span>}
    </OptionMenu>
  )
}

function MultiSelectCell({ field, value, onChange, onCreateOption }: CellProps) {
  const options = parseOptions(field.options)
  const ids = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
  const selected = options.filter((o) => ids.includes(o.id))
  return (
    <OptionMenu
      field={field}
      selectedIds={ids}
      onToggle={(id) =>
        onChange(ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id])
      }
      onClear={() => onChange(null)}
      onCreateOption={onCreateOption}
      triggerClassName="flex min-h-5 w-full flex-wrap items-center gap-1 text-left outline-none"
    >
      {selected.length ? selected.map((o) => <Chip key={o.id} option={o} />) : (
        <span className="text-sm text-transparent">·</span>
      )}
    </OptionMenu>
  )
}

function FileCell({ value, onChange, onUploadFile, onDeleteFile }: CellProps) {
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const file = parseFileValue(value)

  async function handleFile(picked: File | undefined) {
    if (!picked || !onUploadFile || busy) return
    setBusy(true)
    try {
      const uploaded = await onUploadFile(picked)
      if (uploaded) {
        onChange(uploaded)
        // Replaced: drop the old storage object once the new one is in place.
        if (file && onDeleteFile) onDeleteFile(file.path)
      }
    } finally {
      setBusy(false)
    }
  }

  // No upload target yet (e.g. the new-candidate form before the row exists).
  if (!onUploadFile) {
    return <span className="text-xs italic text-muted-foreground">available after saving</span>
  }

  if (busy) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Uploading…
      </span>
    )
  }

  return (
    <div
      className={cn(
        "group/cell flex min-h-5 w-full items-center gap-1 rounded",
        dragOver && "outline-2 outline-dashed outline-primary/60 bg-primary/5",
      )}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        void handleFile(e.dataTransfer.files[0])
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.odt,.rtf,.txt,image/*"
        onChange={(e) => {
          void handleFile(e.target.files?.[0] ?? undefined)
          e.target.value = ""
        }}
      />
      {file ? (
        <>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            title={file.name}
            className="flex min-w-0 items-center gap-1 text-sm hover:underline"
          >
            <Paperclip className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{file.name}</span>
          </a>
          <button
            type="button"
            title="Remove file"
            onClick={() => {
              onChange(null)
              onDeleteFile?.(file.path)
            }}
            className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover/cell:visible"
          >
            <X className="size-3" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex items-center gap-1 text-xs text-muted-foreground",
            !dragOver && "invisible group-hover/cell:visible",
          )}
        >
          <Upload className="size-3" /> Drop file
        </button>
      )}
    </div>
  )
}

export function Cell(props: CellProps) {
  switch (props.field.type) {
    case "select":
      return <SelectCell {...props} />
    case "multi_select":
      return <MultiSelectCell {...props} />
    case "rating":
      return <RatingCell {...props} />
    case "checkbox":
      return <CheckboxCell {...props} />
    case "date":
      return <DateCell {...props} />
    case "number":
      return <NumberCell {...props} />
    case "file":
      return <FileCell {...props} />
    case "text":
      return <LongTextCell {...props} />
    default:
      return <TextishCell {...props} />
  }
}
