"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useDrag, useDrop } from "react-dnd"
import { toast } from "sonner"
import {
  Archive,
  ArchiveRestore,
  ArrowDownAZ,
  ArrowUp,
  ArrowUpAZ,
  ChevronDown,
  History,
  EyeOff,
  GripVertical,
  Hash,
  Link as LinkIcon,
  Mail,
  CalendarDays,
  CheckSquare,
  ChevronsUpDown,
  CircleDot,
  List,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Pencil,
  FileUp,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Type,
  Video,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { parseOptions, reorderByMove, OPTION_COLORS, type FileCellValue, type SelectOption } from "@/lib/recruitment"
import { BoardDndProvider } from "@/components/board/board-dnd-provider"
import type { RecruitmentFieldType } from "@/generated/prisma/enums"
import type { RecruitmentStats } from "@/lib/recruitment-stats"
import { Cell, Chip, CHIP_DOT_CLASSES, type Candidate, type Field } from "./cells"
import { RecruitmentDashboard } from "./recruitment-dashboard"
import { LayoutDashboard } from "lucide-react"

export type BoardSummary = { id: string; name: string; candidateCount: number; archived: boolean }
export type BoardDetail = { id: string; name: string; fields: Field[]; candidates: Candidate[] }

const TYPE_META: Record<RecruitmentFieldType, { label: string; icon: React.ElementType }> = {
  text: { label: "Text", icon: Type },
  select: { label: "Select", icon: CircleDot },
  multi_select: { label: "Multi-select", icon: List },
  number: { label: "Number", icon: Hash },
  date: { label: "Date", icon: CalendarDays },
  url: { label: "URL", icon: LinkIcon },
  email: { label: "Email", icon: Mail },
  phone: { label: "Phone", icon: Phone },
  rating: { label: "Rating", icon: Star },
  checkbox: { label: "Checkbox", icon: CheckSquare },
  file: { label: "File", icon: Paperclip },
}

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Request failed")
  return json as T
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const COLUMN_DND_TYPE = "recruitment-column"

type ColumnDragItem = { id: string; index: number }

/**
 * Draggable/droppable table header cell. The whole header is the drag source;
 * clicking still opens the column menu (HTML5 drag only starts on move).
 * A drop indicator marks the edge where the dragged column will land.
 */
function ColumnHeader({
  field,
  index,
  onMove,
  children,
}: {
  field: Field
  index: number
  onMove: (dragId: string, targetId: string) => void
  children: React.ReactNode
}) {
  const [{ isDragging }, drag] = useDrag(
    () => ({
      type: COLUMN_DND_TYPE,
      item: { id: field.id, index } satisfies ColumnDragItem,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [field.id, index],
  )
  const [{ isOver, fromIndex }, drop] = useDrop(
    () => ({
      accept: COLUMN_DND_TYPE,
      drop: (item: ColumnDragItem) => onMove(item.id, field.id),
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        fromIndex: (monitor.getItem() as ColumnDragItem | null)?.index ?? -1,
      }),
    }),
    [field.id, onMove],
  )
  const showIndicator = isOver && fromIndex !== index
  return (
    <th
      ref={(node) => void drag(drop(node))}
      className={cn(
        "min-w-40 max-w-72 border-b border-l border-border p-0 text-left font-medium",
        isDragging && "opacity-40",
        showIndicator && (fromIndex > index ? "shadow-[inset_2px_0_0_0_var(--primary)]" : "shadow-[inset_-2px_0_0_0_var(--primary)]"),
      )}
    >
      {children}
    </th>
  )
}

function sortValue(field: Field, candidate: Candidate): string | number {
  const v = candidate.values[field.id]
  if (v === null || v === undefined) return field.type === "number" || field.type === "rating" ? -Infinity : ""
  switch (field.type) {
    case "number":
    case "rating":
      return typeof v === "number" ? v : -Infinity
    case "checkbox":
      return v === true ? 1 : 0
    case "select": {
      const opt = parseOptions(field.options).find((o) => o.id === v)
      return opt?.label.toLowerCase() ?? ""
    }
    case "multi_select": {
      const opts = parseOptions(field.options)
      return (Array.isArray(v) ? v : [])
        .map((id) => opts.find((o) => o.id === id)?.label ?? "")
        .join(", ")
        .toLowerCase()
    }
    default:
      return typeof v === "string" ? v.toLowerCase() : ""
  }
}

function searchText(fields: Field[], candidate: Candidate): string {
  const parts: string[] = []
  for (const f of fields) {
    const v = candidate.values[f.id]
    if (v === null || v === undefined) continue
    if (typeof v === "string") {
      if (f.type === "select") {
        const opt = parseOptions(f.options).find((o) => o.id === v)
        parts.push(opt?.label ?? "")
      } else parts.push(v)
    } else if (Array.isArray(v)) {
      const opts = parseOptions(f.options)
      for (const id of v) parts.push(opts.find((o) => o.id === id)?.label ?? "")
    } else parts.push(String(v))
  }
  return parts.join(" ").toLowerCase()
}

export function RecruitmentPage({
  initialBoards,
  initialBoard,
  stats,
  initialView = "overview",
}: {
  initialBoards: BoardSummary[]
  initialBoard: BoardDetail | null
  stats: RecruitmentStats
  initialView?: "overview" | "board"
}) {
  const router = useRouter()
  const [boards, setBoards] = useState(initialBoards)
  const [board, setBoard] = useState<BoardDetail | null>(initialBoard)
  const [view, setView] = useState<"overview" | "board">(initialView)
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<{ fieldId: string; dir: "asc" | "desc" } | null>(null)
  const [panel, setPanel] = useState<
    | { mode: "edit"; candidateId: string }
    | { mode: "create"; draft: Record<string, unknown> }
    | null
  >(null)
  const [creating, setCreating] = useState(false)
  const [cvBusy, setCvBusy] = useState(false)
  const [analyzeBusy, setAnalyzeBusy] = useState(false)
  const cvInputRef = useRef<HTMLInputElement>(null)

  const [newBoardOpen, setNewBoardOpen] = useState(false)
  const [renameBoardOpen, setRenameBoardOpen] = useState(false)
  const [deleteBoardOpen, setDeleteBoardOpen] = useState(false)
  const [newFieldOpen, setNewFieldOpen] = useState(false)
  const [renameField, setRenameField] = useState<Field | null>(null)
  const [optionsField, setOptionsField] = useState<Field | null>(null)
  const [deleteField, setDeleteField] = useState<Field | null>(null)
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [newFieldType, setNewFieldType] = useState<RecruitmentFieldType>("text")

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setShowScrollTop(el.scrollTop > 200)
    onScroll()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [view, board])

  const visibleFields = useMemo(() => (board?.fields ?? []).filter((f) => !f.hidden), [board])

  const rows = useMemo(() => {
    if (!board) return []
    let list = [...board.candidates]
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((c) => searchText(board.fields, c).includes(q))
    }
    if (sort) {
      const field = board.fields.find((f) => f.id === sort.fieldId)
      if (field) {
        list.sort((a, b) => {
          const va = sortValue(field, a)
          const vb = sortValue(field, b)
          const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))
          return sort.dir === "asc" ? cmp : -cmp
        })
      }
    }
    return list
  }, [board, query, sort])

  const panelCandidate =
    panel?.mode === "edit" ? board?.candidates.find((c) => c.id === panel.candidateId) ?? null : null
  const activeBoards = boards.filter((b) => !b.archived)
  const archivedBoards = boards.filter((b) => b.archived)
  const boardSummary = boards.find((b) => b.id === board?.id)

  async function switchBoard(id: string) {
    if (id === board?.id) return
    try {
      const detail = await api<BoardDetail>(`/api/recruitment/boards/${id}`, "GET")
      setBoard(detail)
      setSort(null)
      setPanel(null)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function toggleArchive() {
    if (!board || !boardSummary) return
    const next = !boardSummary.archived
    try {
      await api(`/api/recruitment/boards/${board.id}`, "PATCH", { archived: next })
      setBoards((bs) => bs.map((b) => (b.id === board.id ? { ...b, archived: next } : b)))
      toast.success(next ? "Board moved to History" : "Board restored")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function createBoard() {
    const name = nameDraft.trim()
    if (!name) return
    try {
      const created = await api<{ id: string; name: string }>("/api/recruitment/boards", "POST", { name })
      setBoards((b) => [...b, { ...created, candidateCount: 0, archived: false }])
      setNewBoardOpen(false)
      await switchBoard(created.id)
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function renameBoard() {
    if (!board) return
    const name = nameDraft.trim()
    if (!name) return
    try {
      await api(`/api/recruitment/boards/${board.id}`, "PATCH", { name })
      setBoard({ ...board, name })
      setBoards((bs) => bs.map((b) => (b.id === board.id ? { ...b, name } : b)))
      setRenameBoardOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function removeBoard() {
    if (!board) return
    await api(`/api/recruitment/boards/${board.id}`, "DELETE")
    const rest = boards.filter((b) => b.id !== board.id)
    setBoards(rest)
    setBoard(null)
    if (rest[0]) await switchBoard(rest[0].id)
  }

  async function createField() {
    if (!board) return
    const name = nameDraft.trim()
    if (!name) return
    try {
      const field = await api<Field>(`/api/recruitment/boards/${board.id}/fields`, "POST", {
        name,
        type: newFieldType,
        options: [],
      })
      setBoard({ ...board, fields: [...board.fields, field] })
      setNewFieldOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function patchField(fieldId: string, patch: Record<string, unknown>) {
    if (!board) return
    try {
      const updated = await api<Field>(`/api/recruitment/boards/${board.id}/fields/${fieldId}`, "PATCH", patch)
      setBoard((b) => b && { ...b, fields: b.fields.map((f) => (f.id === fieldId ? updated : f)) })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** Drag-and-drop column reorder: optimistic, persisted as one bulk PATCH. */
  async function moveColumn(dragId: string, targetId: string) {
    if (!board || dragId === targetId) return
    const next = reorderByMove(board.fields, dragId, targetId).map((f, i) => ({ ...f, order: i }))
    setBoard({ ...board, fields: next })
    try {
      await api(`/api/recruitment/boards/${board.id}/fields`, "PATCH", {
        orderedIds: next.map((f) => f.id),
      })
    } catch (e) {
      toast.error((e as Error).message)
      void switchBoardRefresh()
    }
  }

  async function removeField() {
    if (!board || !deleteField) return
    await api(`/api/recruitment/boards/${board.id}/fields/${deleteField.id}`, "DELETE")
    setBoard((b) => b && { ...b, fields: b.fields.filter((f) => f.id !== deleteField.id) })
    setDeleteField(null)
  }

  async function addCandidateFromCv(file: File) {
    if (!board) return
    setCvBusy(true)
    const toastId = toast.loading(`Reading ${file.name}…`)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/recruitment/boards/${board.id}/candidates/from-cv`, {
        method: "POST",
        body: formData,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't read the CV.")
      const { candidate, filled } = json as { candidate: Candidate; filled: number }
      setBoard((b) => b && { ...b, candidates: [...b.candidates, candidate] })
      setBoards((bs) => bs.map((b) => (b.id === board.id ? { ...b, candidateCount: b.candidateCount + 1 } : b)))
      toast.success(`Candidate added from CV — ${filled} field${filled === 1 ? "" : "s"} filled`, { id: toastId })
    } catch (e) {
      toast.error((e as Error).message, { id: toastId })
    } finally {
      setCvBusy(false)
    }
  }

  async function createCandidateFromDraft() {
    if (!board || panel?.mode !== "create") return
    setCreating(true)
    try {
      const created = await api<Candidate>(`/api/recruitment/boards/${board.id}/candidates`, "POST", {
        values: panel.draft,
      })
      setBoard((b) => b && { ...b, candidates: [...b.candidates, created] })
      setBoards((bs) => bs.map((b) => (b.id === board.id ? { ...b, candidateCount: b.candidateCount + 1 } : b)))
      setPanel(null)
      toast.success("Candidate added")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function setValue(candidateId: string, fieldId: string, value: unknown) {
    if (!board) return
    // Optimistic update; server response is authoritative
    setBoard((b) =>
      b && {
        ...b,
        candidates: b.candidates.map((c) =>
          c.id === candidateId
            ? { ...c, values: value === null ? omit(c.values, fieldId) : { ...c.values, [fieldId]: value } }
            : c,
        ),
      },
    )
    try {
      const updated = await api<Candidate>(
        `/api/recruitment/boards/${board.id}/candidates/${candidateId}`,
        "PATCH",
        { values: { [fieldId]: value } },
      )
      setBoard((b) => b && { ...b, candidates: b.candidates.map((c) => (c.id === candidateId ? updated : c)) })
    } catch (e) {
      toast.error((e as Error).message)
      void switchBoardRefresh()
    }
  }

  /** Upload a file for a candidate's file cell; returns the value to store, or null on failure. */
  async function uploadCandidateFile(candidateId: string, file: File): Promise<FileCellValue | null> {
    if (!board) return null
    const formData = new FormData()
    formData.append("file", file)
    formData.append("candidateId", candidateId)
    const res = await fetch(`/api/recruitment/boards/${board.id}/upload`, { method: "POST", body: formData })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error((json as { error?: string }).error ?? "Upload failed")
      return null
    }
    return json as FileCellValue
  }

  /** Best-effort removal of a replaced/cleared file's storage object. */
  function deleteBoardFile(path: string) {
    if (!board) return
    void api(`/api/recruitment/boards/${board.id}/upload`, "DELETE", { path }).catch(() => {})
  }

  async function switchBoardRefresh() {
    if (!board) return
    try {
      const detail = await api<BoardDetail>(`/api/recruitment/boards/${board.id}`, "GET")
      setBoard(detail)
    } catch {
      /* keep stale state */
    }
  }

  async function removeCandidate() {
    if (!board || !deleteCandidateId) return
    await api(`/api/recruitment/boards/${board.id}/candidates/${deleteCandidateId}`, "DELETE")
    setBoard((b) => b && { ...b, candidates: b.candidates.filter((c) => c.id !== deleteCandidateId) })
    setBoards((bs) => bs.map((b) => (b.id === board.id ? { ...b, candidateCount: b.candidateCount - 1 } : b)))
    if (panel?.mode === "edit" && panel.candidateId === deleteCandidateId) setPanel(null)
    setDeleteCandidateId(null)
  }

  /** Re-run the AI CV pass on an existing candidate's attached CV: refreshes
   *  Highlights/Concerns and fills any still-empty fact fields. */
  async function analyzeCandidateCv(candidateId: string) {
    if (!board || analyzeBusy) return
    setAnalyzeBusy(true)
    try {
      const { candidate } = await api<{ candidate: Candidate }>(
        `/api/recruitment/boards/${board.id}/candidates/${candidateId}/analyze-cv`,
        "POST",
      )
      setBoard(
        (b) =>
          b && {
            ...b,
            candidates: b.candidates.map((c) => (c.id === candidate.id ? { ...c, values: candidate.values } : c)),
          },
      )
      toast.success("CV analyzed — highlights and concerns updated")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAnalyzeBusy(false)
    }
  }

  /** Create a new select option on a field; returns its id (or null on failure). */
  async function createOption(field: Field, label: string): Promise<string | null> {
    if (!board) return null
    const options = parseOptions(field.options)
    const id = `opt_${Math.random().toString(36).slice(2, 10)}`
    const color = OPTION_COLORS[options.length % OPTION_COLORS.length]
    try {
      const updated = await api<Field>(`/api/recruitment/boards/${board.id}/fields/${field.id}`, "PATCH", {
        options: [...options, { id, label, color }],
      })
      setBoard((b) => b && { ...b, fields: b.fields.map((f) => (f.id === field.id ? updated : f)) })
      return id
    } catch (e) {
      toast.error((e as Error).message)
      return null
    }
  }

  /** Inline "Create X" from a table cell: create the option, then apply it. */
  async function createOptionAndSet(field: Field, candidateId: string, label: string) {
    if (!board) return
    const id = await createOption(field, label)
    if (!id) return
    const current = board.candidates.find((c) => c.id === candidateId)?.values[field.id]
    const next =
      field.type === "multi_select"
        ? [...(Array.isArray(current) ? (current as string[]) : []), id]
        : id
    await setValue(candidateId, field.id, next)
  }

  /** Inline "Create X" from the new-candidate form: create the option, then apply to the draft. */
  async function createOptionAndSetDraft(field: Field, label: string) {
    const id = await createOption(field, label)
    if (!id) return
    setPanel((p) => {
      if (p?.mode !== "create") return p
      const current = p.draft[field.id]
      const next =
        field.type === "multi_select"
          ? [...(Array.isArray(current) ? (current as string[]) : []), id]
          : id
      return { mode: "create", draft: { ...p.draft, [field.id]: next } }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: board tabs + actions */}
      <div className="flex flex-nowrap items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="mr-2 shrink-0 text-base font-semibold">Recruitment</h1>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setView("overview")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm",
              view === "overview" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60",
            )}
          >
            <LayoutDashboard className="size-3.5" /> Overview
          </button>
          <Link
            href="/recruitment/screening"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted/60"
          >
            <Video className="size-3.5" /> Screening
          </Link>
          {activeBoards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => { setView("board"); void switchBoard(b.id) }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm",
                view === "board" && b.id === board?.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {b.name}
              <span className="ml-1.5 text-xs text-muted-foreground">{b.candidateCount}</span>
            </button>
          ))}
          {view === "board" && boardSummary?.archived && (
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-muted px-2.5 py-1 text-sm font-medium text-foreground">
              <Archive className="size-3.5 text-muted-foreground" /> {boardSummary.name}
            </span>
          )}
          <Button variant="ghost" size="xs" className="shrink-0 whitespace-nowrap" onClick={() => { setNameDraft(""); setNewBoardOpen(true) }}>
            <Plus data-icon="inline-start" /> New board
          </Button>
          {archivedBoards.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-sm text-muted-foreground outline-none hover:bg-muted/60">
                <History className="size-3.5" /> History
                <span className="text-xs">{archivedBoards.length}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
                    Archived boards
                  </DropdownMenuLabel>
                  {archivedBoards.map((b) => (
                    <DropdownMenuItem key={b.id} onClick={() => { setView("board"); void switchBoard(b.id) }}>
                      <Archive className="size-3.5" /> {b.name}
                      <span className="ml-auto text-xs text-muted-foreground">{b.candidateCount}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className={cn("ml-auto flex shrink-0 items-center gap-2", view !== "board" && "hidden")}>
          <div className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidates…"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-40"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {board && (
            <>
              <input
                ref={cvInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void addCandidateFromCv(file)
                  e.target.value = ""
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={cvBusy}
                title="Drop a CV here (or click to pick one) — the AI fills in the candidate's fields"
                onClick={() => cvInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file && !cvBusy) void addCandidateFromCv(file)
                }}
              >
                <FileUp data-icon="inline-start" />
                <span className="hidden sm:inline">{cvBusy ? "Reading CV…" : "Drop CV"}</span>
                <span className="sm:hidden">CV</span>
              </Button>
            </>
          )}
          {board && (
            <Button size="sm" className="shrink-0" onClick={() => setPanel({ mode: "create", draft: {} })}>
              <Plus data-icon="inline-start" /> <span className="hidden sm:inline">Add candidate</span>
              <span className="sm:hidden">Add</span>
            </Button>
          )}
          {board && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Board options"
                className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setNameDraft(board.name); setRenameBoardOpen(true) }}>
                  <Pencil className="size-3.5" /> Rename board
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleArchive}>
                  {boardSummary?.archived ? (
                    <>
                      <ArchiveRestore className="size-3.5" /> Restore from History
                    </>
                  ) : (
                    <>
                      <Archive className="size-3.5" /> Move to History
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteBoardOpen(true)}>
                  <Trash2 className="size-3.5" /> Delete board
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Overview dashboard */}
      {view === "overview" && (
        <RecruitmentDashboard
          stats={stats}
          onOpenBoard={(id) => {
            setView("board")
            void switchBoard(id)
          }}
        />
      )}

      {/* Table */}
      {view === "overview" ? null : !board ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No boards yet — create one to get started.
        </div>
      ) : (
        <BoardDndProvider>
        <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="pen-scroll h-full overflow-auto">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                <th className="w-8 border-b border-border" />
                {visibleFields.map((f, i) => {
                  const TypeIcon = TYPE_META[f.type].icon
                  return (
                    <ColumnHeader key={f.id} field={f} index={i} onMove={moveColumn}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-xs font-medium text-muted-foreground outline-none hover:bg-muted/60">
                          <TypeIcon className="size-3.5 shrink-0" />
                          <span className="truncate">{f.name}</span>
                          {sort?.fieldId === f.id && (
                            <span className="text-primary">{sort.dir === "asc" ? "↑" : "↓"}</span>
                          )}
                          <ChevronDown className="ml-auto size-3 opacity-60" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          <DropdownMenuItem onClick={() => { setNameDraft(f.name); setRenameField(f) }}>
                            <Pencil className="size-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSort({ fieldId: f.id, dir: "asc" })}>
                            <ArrowUpAZ className="size-3.5" /> Sort ascending
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setSort({ fieldId: f.id, dir: "desc" })}>
                            <ArrowDownAZ className="size-3.5" /> Sort descending
                          </DropdownMenuItem>
                          {sort?.fieldId === f.id && (
                            <DropdownMenuItem onClick={() => setSort(null)}>
                              <ChevronsUpDown className="size-3.5" /> Clear sort
                            </DropdownMenuItem>
                          )}
                          {(f.type === "select" || f.type === "multi_select") && (
                            <DropdownMenuItem onClick={() => setOptionsField(f)}>
                              <GripVertical className="size-3.5" /> Edit options
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">Type</DropdownMenuLabel>
                            {(Object.keys(TYPE_META) as RecruitmentFieldType[]).map((t) => {
                              const Meta = TYPE_META[t].icon
                              return (
                                <DropdownMenuItem
                                  key={t}
                                  onClick={() => t !== f.type && patchField(f.id, { type: t })}
                                >
                                  <Meta className="size-3.5" /> {TYPE_META[t].label}
                                  {t === f.type && <span className="ml-auto text-primary">✓</span>}
                                </DropdownMenuItem>
                              )
                            })}
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => patchField(f.id, { hidden: true })}>
                            <EyeOff className="size-3.5" /> Hide column
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleteField(f)}>
                            <Trash2 className="size-3.5" /> Delete column
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ColumnHeader>
                  )
                })}
                <th className="border-b border-l border-border px-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Add column"
                    onClick={() => { setNameDraft(""); setNewFieldType("text"); setNewFieldOpen(true) }}
                  >
                    <Plus />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="group hover:bg-muted/40">
                  <td className="border-b border-border px-1 text-center align-middle">
                    <button
                      type="button"
                      onClick={() => setPanel({ mode: "edit", candidateId: c.id })}
                      className="invisible rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:visible"
                      title="Open candidate"
                    >
                      <PanelRight className="size-3.5" />
                    </button>
                  </td>
                  {visibleFields.map((f) => (
                    <td key={f.id} className="min-w-40 max-w-72 border-b border-l border-border px-2.5 py-1.5 align-middle">
                      <Cell
                        field={f}
                        value={c.values[f.id] ?? null}
                        onChange={(v) => setValue(c.id, f.id, v)}
                        onCreateOption={(label) => createOptionAndSet(f, c.id, label)}
                        onUploadFile={(file) => uploadCandidateFile(c.id, file)}
                        onDeleteFile={deleteBoardFile}
                      />
                    </td>
                  ))}
                  <td className="border-b border-l border-border" />
                </tr>
              ))}
              <tr>
                <td colSpan={visibleFields.length + 2} className="px-2 py-1">
                  <Button variant="ghost" size="xs" onClick={() => setPanel({ mode: "create", draft: {} })}>
                    <Plus data-icon="inline-start" /> New candidate
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {showScrollTop && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Scroll to top"
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            className="absolute bottom-4 right-4 z-20 rounded-full shadow-md"
          >
            <ArrowUp />
          </Button>
        )}
        </div>
        </BoardDndProvider>
      )}

      {/* Candidate side panel: edit an existing row, or the "register candidate" form */}
      {board && panel && (panel.mode === "create" || panelCandidate) && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">
              {panel.mode === "create" ? "New candidate" : "Candidate"}
            </h2>
            <div className="flex items-center gap-1">
              {panel.mode === "edit" && panelCandidate && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Analyze CV with AI"
                  title="AI reads the attached CV: refreshes Highlights/Concerns, fills empty fields"
                  disabled={analyzeBusy}
                  onClick={() => void analyzeCandidateCv(panelCandidate.id)}
                >
                  <Sparkles className={cn(analyzeBusy && "animate-pulse")} />
                  {analyzeBusy ? "Analyzing…" : "Analyze CV"}
                </Button>
              )}
              {panel.mode === "edit" && panelCandidate && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete candidate"
                  onClick={() => setDeleteCandidateId(panelCandidate.id)}
                >
                  <Trash2 />
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => setPanel(null)}>
                <X />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {panel.mode === "create" && (
              <p className="mb-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Fill in what you know — everything can be edited later. Selects accept new values:
                type and press Enter to create an option.
              </p>
            )}
            {board.fields.filter((f) => !f.hidden || panel.mode === "edit").map((f) => (
              <div key={f.id} className="mb-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {(() => { const I = TYPE_META[f.type].icon; return <I className="size-3" /> })()}
                  {f.name}
                </div>
                <div className="rounded-lg border border-border px-2.5 py-1.5">
                  {panel.mode === "edit" && panelCandidate ? (
                    <Cell
                      field={f}
                      value={panelCandidate.values[f.id] ?? null}
                      onChange={(v) => setValue(panelCandidate.id, f.id, v)}
                      onCreateOption={(label) => createOptionAndSet(f, panelCandidate.id, label)}
                      onUploadFile={(file) => uploadCandidateFile(panelCandidate.id, file)}
                      onDeleteFile={deleteBoardFile}
                    />
                  ) : (
                    <Cell
                      field={f}
                      value={panel.mode === "create" ? panel.draft[f.id] ?? null : null}
                      onChange={(v) =>
                        setPanel((p) =>
                          p?.mode === "create" ? { mode: "create", draft: { ...p.draft, [f.id]: v } } : p,
                        )
                      }
                      onCreateOption={(label) => createOptionAndSetDraft(f, label)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          {panel.mode === "create" && (
            <div className="flex gap-2 border-t border-border px-4 py-3">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setPanel(null)}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1" disabled={creating} onClick={createCandidateFromDraft}>
                {creating ? "Adding…" : "Add candidate"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {newBoardOpen && (
        <Modal title="New board" onClose={() => setNewBoardOpen(false)}>
          <NameForm value={nameDraft} onChange={setNameDraft} onSubmit={createBoard} submitLabel="Create board" placeholder="e.g. Backend Developer 2026" />
        </Modal>
      )}
      {renameBoardOpen && board && (
        <Modal title="Rename board" onClose={() => setRenameBoardOpen(false)}>
          <NameForm value={nameDraft} onChange={setNameDraft} onSubmit={renameBoard} submitLabel="Rename" />
        </Modal>
      )}
      {renameField && board && (
        <Modal title="Rename column" onClose={() => setRenameField(null)}>
          <NameForm
            value={nameDraft}
            onChange={setNameDraft}
            onSubmit={async () => {
              await patchField(renameField.id, { name: nameDraft.trim() })
              setRenameField(null)
            }}
            submitLabel="Rename"
          />
        </Modal>
      )}
      {newFieldOpen && board && (
        <Modal title="New column" onClose={() => setNewFieldOpen(false)}>
          <NameForm value={nameDraft} onChange={setNameDraft} onSubmit={createField} submitLabel="Add column" placeholder="Column name">
            <div className="mb-3 grid grid-cols-2 gap-1">
              {(Object.keys(TYPE_META) as RecruitmentFieldType[]).map((t) => {
                const Meta = TYPE_META[t].icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewFieldType(t)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-xs",
                      newFieldType === t ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Meta className="size-3.5" /> {TYPE_META[t].label}
                  </button>
                )
              })}
            </div>
          </NameForm>
        </Modal>
      )}
      {optionsField && board && (
        <Modal title={`Options — ${optionsField.name}`} onClose={() => setOptionsField(null)}>
          <OptionsEditor
            field={board.fields.find((f) => f.id === optionsField.id) ?? optionsField}
            onSave={async (options) => {
              await patchField(optionsField.id, { options })
            }}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={deleteBoardOpen}
        onOpenChange={setDeleteBoardOpen}
        title="Delete this board?"
        description={`"${board?.name ?? ""}" and all its candidates will be permanently deleted.`}
        onConfirm={removeBoard}
      />
      <ConfirmDialog
        open={deleteField !== null}
        onOpenChange={(o) => !o && setDeleteField(null)}
        title="Delete this column?"
        description={`"${deleteField?.name ?? ""}" will be removed from the board. Cell values for it are discarded.`}
        onConfirm={removeField}
      />
      <ConfirmDialog
        open={deleteCandidateId !== null}
        onOpenChange={(o) => !o && setDeleteCandidateId(null)}
        title="Delete this candidate?"
        description="The row will be permanently deleted."
        onConfirm={removeCandidate}
      />
    </div>
  )
}

function omit(values: Record<string, unknown>, key: string): Record<string, unknown> {
  const rest = { ...values }
  delete rest[key]
  return rest
}

function NameForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  placeholder,
  children,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void | Promise<void>
  submitLabel: string
  placeholder?: string
  children?: React.ReactNode
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void onSubmit()
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
        className="mb-3 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
      {children}
      <Button type="submit" size="sm" disabled={!value.trim()} className="w-full">
        {submitLabel}
      </Button>
    </form>
  )
}

function OptionsEditor({
  field,
  onSave,
}: {
  field: Field
  onSave: (options: SelectOption[]) => Promise<void>
}) {
  const [options, setOptions] = useState<SelectOption[]>(() => parseOptions(field.options))
  const [newLabel, setNewLabel] = useState("")

  function cycleColor(idx: number) {
    setOptions((opts) =>
      opts.map((o, i) => {
        if (i !== idx) return o
        const pos = (OPTION_COLORS as readonly string[]).indexOf(o.color)
        return { ...o, color: OPTION_COLORS[(pos + 1) % OPTION_COLORS.length] }
      }),
    )
  }

  return (
    <div>
      <div className="mb-3 max-h-64 space-y-1 overflow-y-auto">
        {options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => cycleColor(i)}
              className="shrink-0 rounded p-1 hover:bg-muted"
              title="Change color"
            >
              <span className={cn("block size-3 rounded-full", CHIP_DOT_CLASSES[o.color] ?? CHIP_DOT_CLASSES.gray)} />
            </button>
            <input
              value={o.label}
              onChange={(e) =>
                setOptions((opts) => opts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
              className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none"
            />
            <Chip option={o} className="hidden sm:inline-flex" />
            <button
              type="button"
              onClick={() => setOptions((opts) => opts.filter((_, j) => j !== i))}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              title="Remove option"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <form
        className="mb-3 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          const label = newLabel.trim()
          if (!label) return
          setOptions((opts) => [
            ...opts,
            {
              id: `opt_${Math.random().toString(36).slice(2, 10)}`,
              label,
              color: OPTION_COLORS[options.length % OPTION_COLORS.length],
            },
          ])
          setNewLabel("")
        }}
      >
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Add an option…"
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!newLabel.trim()}>
          Add
        </Button>
      </form>
      <Button
        size="sm"
        className="w-full"
        onClick={() => void onSave(options.filter((o) => o.label.trim()))}
      >
        Save options
      </Button>
    </div>
  )
}
