"use client"

import { useRef, useState, useEffect } from "react"
import Link from "next/link"
import { Pencil, Trash2, CornerDownRight, SendHorizonal, FileDown, CornerUpLeft, Paperclip, X, FileText, FileSpreadsheet, FileArchive, FileIcon } from "lucide-react"
import { toast } from "sonner"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { cn } from "@/lib/utils"
import { downloadFile } from "@/lib/download-file"
import { useCurrentUser } from "@/hooks/use-current-user"
import { addComment } from "@/lib/api/tickets"
import { uploadTemporaryAttachmentFile } from "@/lib/api/upload-temporary-file"
import {
  COMMENT_ATTACH_ACCEPT,
  contentTypeForFile,
  isAllowedUploadFile,
  maxBytesFor,
  maxLabelFor,
} from "@/lib/mime"
import type { MentionableUser } from "@/lib/mentionable-users"
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item"
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown"
import { formatDateTime } from "@/lib/format"

type ReplyFileEntry = { id: number; file: File; previewUrl: string | null }

let _nextReplyFileId = 0

function replyFileTypeIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "pdf") return <FileText className="size-[22px] text-red-400" />
  if (["xls", "xlsx", "csv"].includes(ext)) return <FileSpreadsheet className="size-[22px] text-green-500" />
  if (["zip", "rar", "7z", "gz"].includes(ext)) return <FileArchive className="size-[22px] text-yellow-500" />
  if (["doc", "docx"].includes(ext)) return <FileText className="size-[22px] text-pen-blue" />
  return <FileIcon className="size-[22px] text-pen-subtle" />
}

type CommentAttachment = {
  id: string
  storageUrl: string
  fileName: string
  fileSize: number
}

type CommentData = {
  id: string
  body: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  authorId: string
  authorName: string
  authorAvatarUrl: string | null
  attachments: CommentAttachment[]
  replies: CommentData[]
}

/** Points a reply back to the comment it answers, for the flat timeline. */
type ParentRef = {
  id: string
  authorName: string
  snippet: string
  isDeleted: boolean
}

type Props = {
  comment: CommentData
  ticketId: string
  subDepartmentMembers?: MentionableUser[]
  /** Set when this comment is a reply — renders the "Replying to …" reference. */
  parentRef?: ParentRef | null
  /** Bubbles a newly-posted reply up so the flat timeline can show it. */
  onReplySubmitted?: (reply: CommentData) => void
}

/** Smoothly scrolls to a comment and briefly highlights it. */
function focusComment(id: string) {
  const el = document.getElementById(`comment-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: "smooth", block: "center" })
  el.classList.add("pen-comment-flash")
  window.setTimeout(() => el.classList.remove("pen-comment-flash"), 1600)
}

function Avatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
  if (src) return <img src={src} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-pen-blue/15 font-sans font-semibold text-pen-blue"
    >
      {initials}
    </div>
  )
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"])

function isImage(fileName: string | undefined | null) {
  if (!fileName) return false
  return IMAGE_EXTS.has(fileName.split(".").pop()?.toLowerCase() ?? "")
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentList({ attachments }: { attachments: CommentAttachment[] }) {
  if (!attachments.length) return null
  const images = attachments.filter((a) => isImage(a.fileName))
  const files = attachments.filter((a) => !isImage(a.fileName))
  return (
    <div className="mt-2 flex flex-col gap-2">
      {images.map((a) => (
        <Link key={a.id} href={a.storageUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={a.storageUrl}
            alt={a.fileName}
            className="max-h-64 max-w-full rounded-lg object-contain"
          />
        </Link>
      ))}
      {files.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => downloadFile(a.storageUrl, a.fileName)}
          title={`Download ${a.fileName}`}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 text-left font-sans text-[12px] text-pen-foreground transition-colors hover:border-pen-blue/40 hover:bg-pen-blue/5"
        >
          <FileDown className="size-3.5 shrink-0 text-pen-blue" />
          <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
          <span className="shrink-0 text-[11.5px] text-pen-subtle">{formatBytes(a.fileSize)}</span>
        </button>
      ))}
    </div>
  )
}

function renderBody(body: string | null | undefined) {
  if (!body) return null
  return body.split(/(@[\w.-]+)/).map((part, i) =>
    part.startsWith("@") ? (
      <mark key={i} className="rounded-[3px] bg-pen-blue/10 px-0.5 font-semibold text-pen-blue not-italic">
        {part.replace(/_/g, " ")}
      </mark>
    ) : <span key={i}>{part}</span>
  )
}

function InlineReplyBox({
  ticketId,
  parentId,
  subDepartmentMembers,
  onSubmitted,
  onCancel,
}: {
  ticketId: string
  parentId: string
  subDepartmentMembers?: MentionableUser[]
  onSubmitted: (reply: CommentData) => void
  onCancel: () => void
}) {
  const currentUser = useCurrentUser()
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const replyBoxRef = useRef<HTMLDivElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileEntries, setFileEntries] = useState<ReplyFileEntry[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const filtered = mentionQuery !== null
    ? (subDepartmentMembers ?? []).filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : []

  // Revoke object URLs on unmount
  const fileEntriesRef = useRef(fileEntries)
  fileEntriesRef.current = fileEntries
  useEffect(() => {
    return () => {
      fileEntriesRef.current.forEach((e) => { if (e.previewUrl) URL.revokeObjectURL(e.previewUrl) })
    }
  }, [])

  function addFiles(files: File[]) {
    const accepted: File[] = []
    for (const file of files) {
      if (!isAllowedUploadFile(file)) {
        toast.error(`"${file.name}" is not a supported file type`)
        continue
      }
      const contentType = contentTypeForFile(file.name, file.type)
      if (file.size > maxBytesFor(contentType)) {
        toast.error(`"${file.name}" exceeds the ${maxLabelFor(contentType)} limit`)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length === 0) return
    const newEntries: ReplyFileEntry[] = accepted.map((file) => ({
      id: _nextReplyFileId++,
      file,
      previewUrl: contentTypeForFile(file.name, file.type).startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    }))
    setFileEntries((prev) => [...prev, ...newEntries])
  }

  function removeFile(id: number) {
    setFileEntries((prev) => {
      const entry = prev.find((e) => e.id === id)
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl)
      return prev.filter((e) => e.id !== id)
    })
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pastedFiles = Array.from(e.clipboardData.files)
    if (pastedFiles.length > 0) {
      e.preventDefault()
      addFiles(pastedFiles)
      return
    }
    const imageItem = Array.from(e.clipboardData.items).find((item) => item.type.startsWith("image/"))
    if (!imageItem) return
    e.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    const ext = file.type.split("/")[1] ?? "png"
    addFiles([new File([file], `pasted-image.${ext}`, { type: file.type })])
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length)
    const match = before.match(/@(\w*)$/)
    const newQuery = match ? match[1] : null
    if (newQuery !== mentionQuery) setHighlightedIndex(0)
    setMentionQuery(newQuery)
    e.target.style.height = "auto"
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  function insertMention(name: string) {
    const el = textRef.current
    if (!el) return
    const handle = name.replace(/\s+/g, "_")
    const pos = el.selectionStart ?? el.value.length
    const before = el.value.slice(0, pos).replace(/@[\w.-]*$/, `@${handle} `)
    el.value = before + el.value.slice(pos)
    el.setSelectionRange(before.length, before.length)
    el.focus()
    setMentionQuery(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const suggestionsOpen = mentionQuery !== null && filtered.length > 0

    if (suggestionsOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlightedIndex((i) => (i + 1) % filtered.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlightedIndex((i) => (i - 1 + filtered.length) % filtered.length)
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        insertMention(filtered[highlightedIndex].name)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if (e.key === "Escape") onCancel()
  }

  async function submit() {
    const body = textRef.current?.value.trim() ?? ""
    if (!body && fileEntries.length === 0) return
    setSubmitting(true)

    const filesToUpload = fileEntries
    let uploadedAttachments: CommentAttachment[] = []

    if (filesToUpload.length > 0) {
      setUploading(true)
      const results = await Promise.all(
        filesToUpload.map((entry) =>
          uploadTemporaryAttachmentFile(entry.file)
            .then((uploaded) => ({ ok: true as const, uploaded }))
            .catch((err: unknown) => ({
              ok: false as const,
              name: entry.file.name,
              message: err instanceof Error ? err.message : "Upload failed",
            })),
        ),
      )
      setUploading(false)

      const failed = results.filter((r) => !r.ok) as { ok: false; name: string; message: string }[]
      if (failed.length > 0) {
        failed.forEach((r) => toast.error(`"${r.name}": ${r.message}`))
        setSubmitting(false)
        return
      }
      uploadedAttachments = results
        .filter((r): r is { ok: true; uploaded: CommentAttachment } => r.ok)
        .map((r) => r.uploaded)
    }

    let data: {
      id: string
      body: string
      createdAt: string
      author?: { id: string; name: string; avatarUrl: string | null }
      attachments?: CommentAttachment[]
    }
    try {
      data = await addComment(ticketId, {
        body,
        parentId,
        hasAttachment: uploadedAttachments.length > 0,
        attachments: uploadedAttachments.map((a) => a.id),
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post reply")
      setSubmitting(false)
      return
    }

    onSubmitted({
      id: data.id,
      body: data.body,
      createdAt: data.createdAt,
      editedAt: null,
      deletedAt: null,
      authorId: data.author?.id ?? "",
      authorName: data.author?.name ?? currentUser?.name ?? "",
      authorAvatarUrl: data.author?.avatarUrl ?? null,
      attachments: data.attachments ?? uploadedAttachments,
      replies: [],
    })
    if (textRef.current) { textRef.current.value = ""; textRef.current.style.height = "auto" }
    if (fileRef.current) fileRef.current.value = ""
    filesToUpload.forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl) })
    setFileEntries([])
    setSubmitting(false)
  }

  return (
    <div className="relative mt-2.5 flex gap-2.5">
      <div className="flex flex-col items-center pt-1">
        <div className="size-[7px] rounded-full bg-pen-card-border" />
      </div>
      <div ref={replyBoxRef} className="flex-1">
        <div className="rounded-xl border border-pen-card-border bg-pen-bg px-3 py-2 focus-within:border-pen-blue/50 focus-within:ring-1 focus-within:ring-pen-blue/20 transition-all">
          <textarea
            ref={textRef}
            autoFocus
            rows={1}
            placeholder="Write a reply… use @ to mention"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="w-full resize-none bg-transparent font-sans text-[12.5px] leading-[19px] text-pen-foreground outline-none placeholder:text-pen-subtle overflow-hidden"
            style={{ minHeight: 26, maxHeight: 160 }}
          />

          {/* File previews */}
          {fileEntries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-[8px]">
              {fileEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="relative size-[72px] rounded-[6px] bg-pen-surface"
                >
                  {entry.previewUrl ? (
                    <img
                      src={entry.previewUrl}
                      alt={entry.file.name}
                      className="size-full rounded-[6px] object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-[4px] px-[5px]">
                      {replyFileTypeIcon(entry.file.name)}
                      <span className="w-full truncate text-center font-sans text-[9.5px] text-pen-muted leading-tight">
                        {entry.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(entry.id)}
                    className="absolute -right-[5px] -top-[5px] flex size-[15px] items-center justify-center rounded-full bg-pen-surface text-pen-subtle shadow hover:text-pen-foreground"
                  >
                    <X className="size-[8px]" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={submitting || uploading}
            className="flex h-6 items-center gap-1.5 rounded-lg bg-pen-blue px-2.5 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50"
          >
            {submitting || uploading ? <LoadingSpinner className="size-3" /> : <SendHorizonal className="size-[11px]" />}
            {uploading ? "Uploading…" : submitting ? "Posting…" : "Reply"}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={COMMENT_ATTACH_ACCEPT}
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) addFiles(files)
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Attach files"
            className="flex h-6 items-center gap-1 rounded-lg px-2 font-sans text-[11.5px] text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-muted"
          >
            <Paperclip className="size-[11px]" />
            Attach
          </button>
          <button type="button" onClick={onCancel} className="font-sans text-[11.5px] text-pen-subtle hover:text-pen-muted">
            Cancel
          </button>
          <span className="font-sans text-[11.5px] text-pen-subtle/50">↵ to send · ⇧↵ for newline</span>
        </div>
      </div>
      <AnchoredDropdown
        anchorRef={replyBoxRef}
        open={mentionQuery !== null && filtered.length > 0}
        placement="bottom"
        maxHeight={160}
        className="rounded-lg border border-pen-card-border bg-pen-bg shadow-lg"
      >
        <ul className="w-full">
          {filtered.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(m.name) }}
                  className={[
                    userListPickerButtonClass,
                    "px-2.5 py-1.5 transition-colors",
                    i === highlightedIndex ? "bg-pen-surface" : "hover:bg-pen-surface",
                  ].join(" ")}
                >
                  <UserListItem
                    person={m}
                    avatarSize={22}
                    nameClassName="font-normal"
                  />
                </button>
              </li>
            ))}
        </ul>
      </AnchoredDropdown>
    </div>
  )
}

export function CommentItem({ comment, ticketId, subDepartmentMembers, parentRef, onReplySubmitted }: Props) {
  const currentUser = useCurrentUser()
  const [localComment, setLocalComment] = useState(comment)
  const [mode, setMode] = useState<"view" | "editing">("view")
  const [editValue, setEditValue] = useState(comment.body)
  const [saving, setSaving] = useState(false)
  const [replying, setReplying] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const showAll =
    mentionQuery !== null && "all".startsWith(mentionQuery.toLowerCase())
  const filteredMembers =
    mentionQuery !== null
      ? (subDepartmentMembers ?? []).filter((m) =>
          m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
        )
      : []
  const suggestionCount = (showAll ? 1 : 0) + filteredMembers.length

  function beginEditing() {
    setMode("editing")
    setEditValue(localComment.body)
    setMentionQuery(null)
    setHighlightedIndex(0)
  }

  function cancelEditing() {
    setMode("view")
    setEditValue(localComment.body)
    setMentionQuery(null)
    setHighlightedIndex(0)
  }

  function handleEditChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const { value, selectionStart } = e.target
    setEditValue(value)
    const before = value.slice(0, selectionStart ?? value.length)
    const match = before.match(/@(\w*)$/)
    const newQuery = match ? match[1] : null
    if (newQuery !== mentionQuery) setHighlightedIndex(0)
    setMentionQuery(newQuery)
  }

  function insertMentionInEdit(name: string) {
    const el = editRef.current
    if (!el) return
    const handle = name.replace(/\s+/g, "_")
    const pos = el.selectionStart ?? editValue.length
    const before = editValue.slice(0, pos).replace(/@[\w.-]*$/, `@${handle} `)
    const after = editValue.slice(pos)
    const newValue = before + after
    setEditValue(newValue)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const suggestionsOpen = mentionQuery !== null && suggestionCount > 0

    if (suggestionsOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHighlightedIndex((i) => (i + 1) % suggestionCount)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setHighlightedIndex((i) => (i - 1 + suggestionCount) % suggestionCount)
        return
      }
      if (e.key === "Enter") {
        e.preventDefault()
        if (showAll && highlightedIndex === 0) {
          insertMentionInEdit("all")
        } else {
          const memberIdx = showAll ? highlightedIndex - 1 : highlightedIndex
          insertMentionInEdit(filteredMembers[memberIdx].name)
        }
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }
  }

  // Sync from the parent whenever the comment is updated externally (file upload
  // patches attachments; a create/realtime race can leave the row mounted before
  // its body is populated). Don't touch anything while editing so we don't clobber
  // in-progress edits, and only "heal" a blank body/deletion — never revert a body
  // the user already sees to a stale prop value.
  useEffect(() => {
    if (mode === "editing") return
    setLocalComment((prev) => {
      const next = { ...prev, attachments: comment.attachments ?? [] }
      if (!prev.body && comment.body) {
        next.body = comment.body
        next.editedAt = comment.editedAt
      }
      if (!prev.deletedAt && comment.deletedAt) next.deletedAt = comment.deletedAt
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment.attachments, comment.body, comment.deletedAt])
  const isAuthor = localComment.authorId === currentUser?.id
  const isDeleted = !!localComment.deletedAt
  const isReply = !!parentRef
  const replyCount = comment.replies.length

  async function saveEdit() {
    const trimmed = editValue.trim()
    if (!trimmed) return
    setSaving(true)
    const res = await fetch(`/api/comments/${localComment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    })
    setSaving(false)
    if (res.ok) {
      setLocalComment((c) => ({ ...c, body: editValue.trim(), editedAt: new Date().toISOString() }))
      setMode("view")
      setMentionQuery(null)
    }
  }

  async function softDelete() {
    setDeleting(true)
    const res = await fetch(`/api/comments/${localComment.id}`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) {
      setLocalComment((c) => ({ ...c, deletedAt: new Date().toISOString(), body: "" }))
      setConfirmingDelete(false)
    }
  }

  function handleReplySubmitted(reply: CommentData) {
    onReplySubmitted?.(reply)
    setReplying(false)
  }

  const avatarSize = isReply ? 24 : 30

  return (
    <>
    <div
      id={`comment-${localComment.id}`}
      className={cn(
        "flex gap-3 rounded-lg transition-colors duration-500",
        isReply && "border-l-2 border-pen-card-border/60 pl-3",
      )}
    >
      {/* Avatar */}
      <div className="flex flex-col items-center">
        <Avatar name={localComment.authorName} src={localComment.authorAvatarUrl} size={avatarSize} />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {/* Replying-to reference — a compact one-line quote of the original */}
        {parentRef && (
          <button
            type="button"
            onClick={() => focusComment(parentRef.id)}
            title={`Go to ${parentRef.authorName}'s comment`}
            className="mb-1 flex max-w-full items-center gap-1 rounded border-l-2 border-pen-blue/40 bg-pen-surface/50 py-0.5 pl-1.5 pr-2 text-[11px] leading-tight text-pen-subtle transition-colors hover:border-pen-blue hover:bg-pen-blue/5"
          >
            <CornerUpLeft className="size-2.5 shrink-0 text-pen-subtle" />
            <span className="truncate">
              <span className="font-semibold text-pen-foreground">
                {parentRef.authorName}
              </span>
              {parentRef.isDeleted ? (
                <span className="italic text-pen-subtle/60"> · deleted comment</span>
              ) : parentRef.snippet ? (
                <span className="text-pen-subtle">: {parentRef.snippet}</span>
              ) : null}
            </span>
          </button>
        )}

        {/* Name + meta row */}
        <div className="group/c flex min-w-0 items-baseline gap-2">
          <span className="font-sans text-[12.5px] font-semibold leading-none text-pen-foreground">
            {localComment.authorName}
          </span>
          <span className="font-sans text-[11.5px] text-pen-subtle shrink-0">
            {formatDateTime(new Date(localComment.createdAt))}
          </span>
          {localComment.editedAt && !isDeleted && (
            <span className="font-sans text-[11.5px] text-pen-subtle/50 shrink-0">edited</span>
          )}
          {/* Actions on hover */}
          {isAuthor && !isDeleted && mode === "view" && (
            <div className="ml-auto flex shrink-0 items-center gap-0.5 transition-opacity">
              <button onClick={beginEditing}
                className="flex size-6 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-surface hover:text-pen-foreground" title="Edit">
                <Pencil className="size-[11px]" />
              </button>
              <button onClick={() => setConfirmingDelete(true)}
                className="flex size-6 items-center justify-center rounded-md text-pen-subtle hover:bg-pen-red/10 hover:text-pen-red" title="Delete">
                <Trash2 className="size-[11px]" />
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="mt-0.5">
          {isDeleted ? (
            <p className="font-sans text-[12px] italic text-pen-subtle/50">This comment was deleted.</p>
          ) : mode === "editing" ? (
            <div className="relative space-y-2">
              <textarea
                ref={editRef}
                value={editValue}
                onChange={handleEditChange}
                onKeyDown={handleEditKeyDown}
                rows={3}
                autoFocus
                placeholder="Edit comment… use @ to mention a teammate or @all"
                className="w-full resize-none rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2 font-sans text-[12.5px] text-pen-foreground outline-none focus:border-pen-blue/50 focus:ring-1 focus:ring-pen-blue/20"
              />
              <AnchoredDropdown
                anchorRef={editRef}
                open={mentionQuery !== null && suggestionCount > 0}
                placement="bottom"
                maxHeight={160}
                className="rounded-lg border border-pen-card-border bg-pen-bg shadow-lg"
              >
                <ul className="w-full">
                  {showAll && (
                    <li>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          insertMentionInEdit("all")
                        }}
                        className={[
                          userListPickerButtonClass,
                          "w-full px-2.5 py-1.5 text-left transition-colors",
                          highlightedIndex === 0 ? "bg-pen-surface" : "hover:bg-pen-surface",
                        ].join(" ")}
                      >
                        <span className="font-semibold text-pen-blue">@all</span>
                        <span className="ml-2 text-pen-subtle">
                          — mention everyone ({(subDepartmentMembers ?? []).length})
                        </span>
                      </button>
                    </li>
                  )}
                  {filteredMembers.map((m, i) => {
                    const idx = showAll ? i + 1 : i
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            insertMentionInEdit(m.name)
                          }}
                          className={[
                            userListPickerButtonClass,
                            "px-2.5 py-1.5 transition-colors",
                            idx === highlightedIndex ? "bg-pen-surface" : "hover:bg-pen-surface",
                          ].join(" ")}
                        >
                          <UserListItem
                            person={m}
                            avatarSize={22}
                            nameClassName="font-normal"
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </AnchoredDropdown>
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={saving}
                  className="flex h-7 items-center gap-1.5 rounded-lg bg-pen-blue px-3 font-sans text-[11.5px] font-medium text-white dark:text-gray-900 disabled:opacity-50">
                  {saving && <LoadingSpinner className="size-3" />}
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={cancelEditing}
                  className="h-7 rounded-lg border border-pen-card-border px-3 font-sans text-[11.5px] text-pen-muted hover:bg-pen-surface">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-sans text-[12.5px] leading-[20px] text-pen-foreground whitespace-pre-wrap">
                {renderBody(localComment.body)}
              </p>
              {(localComment.attachments?.length ?? 0) > 0 && (
                <AttachmentList attachments={localComment.attachments!} />
              )}
            </>
          )}
        </div>

        {/* Reply button */}
        {!isDeleted && !isReply && mode === "view" && (
          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            className="mt-1.5 flex items-center gap-1 font-sans text-[11.5px] font-medium text-pen-subtle transition-colors hover:text-pen-blue"
          >
            <CornerDownRight className="size-[11px]" />
            {replying ? "Cancel reply" : "Reply"}
            {replyCount > 0 && !replying && (
              <span className="ml-0.5 text-[11.5px] text-pen-subtle/60">· {replyCount}</span>
            )}
          </button>
        )}

        {/* Inline reply input */}
        {replying && (
          <InlineReplyBox
            ticketId={ticketId}
            parentId={localComment.id}
            subDepartmentMembers={subDepartmentMembers}
            onSubmitted={handleReplySubmitted}
            onCancel={() => setReplying(false)}
          />
        )}
      </div>
    </div>

    {/* Custom delete confirm dialog */}
    {confirmingDelete && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 pen-overlay-backdrop"
          onClick={() => !deleting && setConfirmingDelete(false)}
        />
        {/* Panel */}
        <div className="relative w-full max-w-[340px] rounded-2xl border border-pen-card-border bg-pen-card p-5 shadow-2xl">
          <div className="mb-1 flex items-center gap-2">
            <Trash2 className="size-4 shrink-0 text-red-500" />
            <p className="font-sans text-[14px] font-semibold text-pen-foreground">Delete comment?</p>
          </div>
          <p className="mb-5 font-sans text-[12.5px] text-pen-muted">
            This comment will be permanently removed and cannot be recovered.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmingDelete(false)}
              className="h-8 rounded-lg border border-pen-card-border px-4 font-sans text-[12px] text-pen-muted transition-colors hover:bg-pen-surface disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={softDelete}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-red-500 px-4 font-sans text-[12px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {deleting ? <LoadingSpinner className="size-3" /> : null}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
