"use client";

import { useMemo, useRef, useState } from "react";
import {
  SendHorizonal,
  Mail,
  Paperclip,
  X,
  FileText,
  ChevronDown,
  Download,
  StickyNote,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { MentionTextarea } from "@/components/tickets/mention-textarea";
import type { MentionableUser } from "@/lib/mentionable-users";
import { sendCustomerMessage } from "@/lib/api/tickets";
import { uploadTemporaryAttachmentFile } from "@/lib/api/upload-temporary-file";
import { downloadFile } from "@/lib/download-file";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function isImage(fileName: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(fileName);
}

/** Renders note text, highlighting `@Handle` mentions (underscores → spaces). */
function renderNoteBody(body: string) {
  return body.split(/(@[\w.-]+)/).map((part, i) =>
    part.startsWith("@") ? (
      <mark
        key={i}
        className="rounded-[3px] bg-pen-blue/10 px-0.5 font-semibold text-pen-blue not-italic"
      >
        {part.replace(/_/g, " ")}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * Removes inline-image placeholders that plain-text emails leave behind —
 * e.g. `[https://…/signature_icon]` or `[image: logo]`. Email clients render
 * signature `<img>`s as bracketed URLs/alt-text in the text part, which show
 * up as broken `[…]` noise in the thread. Real HTML `<img>` tags are untouched.
 */
function stripImagePlaceholders(html: string): string {
  return html
    .replace(/\[image:[^\]\r\n]*\](?:\s*<br\s*\/?>)?/gi, "")
    .replace(/\[https?:\/\/[^\]\s]*\](?:\s*<br\s*\/?>)?/gi, "")
    .replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br /><br />");
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Splits an email body into the new reply text and the trailing quoted history
 * (the "On <date> … wrote:" attribution, blockquotes, forwarded headers, etc.)
 * so the quote can be collapsed behind a toggle. Best-effort on raw HTML — falls
 * back to showing everything when no clean boundary is found.
 */
function splitQuotedReply(html: string): {
  visible: string;
  quoted: string | null;
} {
  if (!html) return { visible: html, quoted: null };
  const patterns: RegExp[] = [
    /<blockquote[\s>]/i,
    /<div[^>]*class="[^"]*gmail_quote/i,
    /<div[^>]*id="?divRplyFwdMsg/i,
    /(?:<br\s*\/?>|\n|^)\s*On\s+.{0,300}?\bwrote:/i,
    /(?:<br\s*\/?>|\n|^)\s*-{2,}\s*Original Message\s*-{2,}/i,
    /(?:<br\s*\/?>|\n|^)\s*From:\s[\s\S]{0,200}?\bSent:/i,
  ];
  let idx = -1;
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && (idx === -1 || m.index < idx)) idx = m.index;
  }
  if (idx <= 0) return { visible: html, quoted: null };

  const visible = html.slice(0, idx).replace(/(?:\s|<br\s*\/?>|&nbsp;)+$/i, "");
  const quoted = html.slice(idx);
  // Guards: don't collapse if the "visible" part is empty (whole message is a
  // quote) or the "quoted" part has no real content.
  const visibleText = visible.replace(/<[^>]*>|\s|&nbsp;/g, "");
  const quotedText = quoted.replace(/<[^>]*>|\s|&nbsp;/g, "");
  if (!visibleText || !quotedText) return { visible: html, quoted: null };
  return { visible, quoted };
}

export type MessageNote = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  editedAt: string | null;
};

export type MessageData = {
  id: string;
  direction: "inbound" | "outbound";
  status: "trusted" | "quarantined" | "system";
  body: string;
  fromName: string;
  fromEmail: string;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdAt: string;
  attachments: {
    id: string;
    storageUrl: string;
    fileName: string;
    fileSize: number;
  }[];
  notes?: MessageNote[];
};

type PendingAttachment = {
  id: string;
  fileName: string;
  previewUrl: string | null; // object URL for images
  uploading: boolean;
};

/**
 * Composer for emailing the intake submitter. The "Reply to submitter" label,
 * Mail icon, and shown recipient make its external-email intent explicit so a
 * staffer can never mistake it for an internal note. Colors follow the theme
 * accent (--pen-blue) so it fits every theme.
 */
export function CustomerReplyComposer({
  ticketId,
  customerName,
  customerEmail,
  onSent,
  onSentConfirmed,
  onSentFailed,
}: {
  ticketId: string;
  customerName: string | null;
  customerEmail: string;
  /** Called immediately on send with an optimistic message (temp ID). */
  onSent?: (message: MessageData) => void;
  /** Called after API succeeds — replace the optimistic message with the confirmed one. */
  onSentConfirmed?: (tempId: string, real: MessageData) => void;
  /** Called if the API fails — remove the optimistic message. */
  onSentFailed?: (tempId: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  // Bumped after each send to remount the editor and clear its content — the
  // RichTextEditor only reads `content` on mount (same pattern as sprint form).
  const [editorKey, setEditorKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const tempId = crypto.randomUUID();
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null;

      setAttachments((prev) => [
        ...prev,
        { id: tempId, fileName: file.name, previewUrl, uploading: true },
      ]);

      try {
        const uploaded = await uploadTemporaryAttachmentFile(file);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === tempId ? { ...a, id: uploaded.id, uploading: false } : a,
          ),
        );
      } catch (err) {
        setAttachments((prev) => prev.filter((a) => a.id !== tempId));
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(`Failed to upload ${file.name}: ${message}`);
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  async function submit() {
    const body = value.trim();
    if ((!body && attachments.length === 0) || submitting) return;
    if (attachments.some((a) => a.uploading)) {
      toast.error("Please wait for uploads to finish");
      return;
    }
    setSubmitting(true);

    // Optimistic message — appears instantly before the API responds.
    const tempId = `pending-${crypto.randomUUID()}`;
    const optimistic: MessageData = {
      id: tempId,
      direction: "outbound",
      status: "trusted",
      body,
      fromName: "",
      fromEmail: "",
      authorId: null,
      authorName: null,
      authorAvatarUrl: null,
      createdAt: new Date().toISOString(),
      attachments: [],
    };
    onSent?.(optimistic);

    // Clear the composer immediately so the user can start typing the next reply.
    const sentAttachments = attachments.slice();
    setValue("");
    setEditorKey((k) => k + 1);
    sentAttachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);

    try {
      const real = (await sendCustomerMessage(
        ticketId,
        body,
        sentAttachments.map((a) => a.id),
      )) as MessageData;
      onSentConfirmed?.(tempId, real);
      toast.success(
        `Reply sent to ${customerName ?? customerEmail} (submitter)`,
      );
    } catch (err) {
      onSentFailed?.(tempId);
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSubmitting(false);
    }
  }

  const canSend = !submitting && (!!value.trim() || attachments.length > 0);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-pen-blue/25 bg-pen-card">
      {/* Header band — makes the external-email intent explicit */}
      <div className="flex items-center gap-1.5 border-b border-pen-blue/15 bg-pen-blue-tint/50 px-3.5 py-2">
        <Mail className="size-[13px] shrink-0 text-pen-blue" />
        <span className="font-sans text-[11px] font-semibold uppercase tracking-wide text-pen-id">
          Reply to submitter
        </span>
        <span className="truncate font-sans text-[11.5px] text-pen-muted">
          · {customerEmail}
        </span>
      </div>

      {/* Compose surface — the editor is stripped of its own border and given the
          lighter input surface so it reads as a writing "well" set between the
          darker header/toolbar and action bands (contrast, not extra borders,
          separates the zones). */}
      <div
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <RichTextEditor
          key={editorKey}
          content=""
          onChange={setValue}
          placeholder="Write a reply — the submitter receives this as an email…"
          showAttachButton={false}
          toolbarExtraAlign="left"
          toolbarExtra={
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={submitting}
              title="Attach file"
              className="flex size-6 items-center justify-center rounded text-pen-muted transition-colors hover:bg-pen-card hover:text-pen-foreground disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Paperclip className="size-3.5" />
            </button>
          }
          className="min-h-0 rounded-none border-0 bg-transparent [&>div:first-child]:border-pen-blue/15 [&>div:first-child]:bg-transparent"
          contentClassName="max-h-[220px]"
        />
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-pen-blue/10 px-3.5 py-2.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative flex items-center gap-1.5 rounded-md border border-pen-card-border bg-pen-bg px-2 py-1.5"
            >
              {att.uploading ? (
                <LoadingSpinner className="size-[12px] text-pen-muted" />
              ) : att.previewUrl ? (
                <img
                  src={att.previewUrl}
                  alt={att.fileName}
                  className="size-8 rounded object-cover"
                />
              ) : (
                <FileText className="size-[13px] shrink-0 text-pen-muted" />
              )}
              <span className="max-w-[120px] truncate font-sans text-[11.5px] text-pen-foreground">
                {att.fileName}
              </span>
              {!att.uploading && (
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="ml-0.5 text-pen-subtle hover:text-pen-red"
                >
                  <X className="size-[11px]" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 border-t border-pen-blue/15 px-3 py-2">
        {/* Hidden file input — triggered by the attach button in the editor toolbar */}
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
          onClick={(e) => {
            (e.target as HTMLInputElement).value = "";
          }}
        />

        <span className="flex-1" />

        <span className="hidden select-none font-sans text-[11px] text-pen-subtle sm:inline">
          <kbd className="rounded border border-pen-card-border bg-pen-surface px-1 py-px font-sans text-[10px] text-pen-muted">
            ⌘
          </kbd>
          <kbd className="ml-0.5 rounded border border-pen-card-border bg-pen-surface px-1 py-px font-sans text-[10px] text-pen-muted">
            ↵
          </kbd>
          <span className="ml-1.5">to send</span>
        </span>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          className="flex items-center gap-1.5 rounded-lg bg-pen-blue px-3.5 py-1.5 font-sans text-[12px] font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-45 disabled:shadow-none dark:text-gray-900"
        >
          {submitting ? (
            <LoadingSpinner className="size-[13px]" />
          ) : (
            <SendHorizonal className="size-[13px]" />
          )}
          Send email
        </button>
      </div>
    </div>
  );
}

/**
 * Internal, staff-only notes attached to one customer email message. The
 * customer never sees these — they add context to a specific reply within the
 * ticket timeline. Plain text with edit + delete for the note's author.
 */
function MessageNotes({
  ticketId,
  messageId,
  notes,
  subDepartmentMembers,
  onAdded,
  onChanged,
  onRemoved,
}: {
  ticketId: string;
  messageId: string;
  notes: MessageNote[];
  subDepartmentMembers?: MentionableUser[];
  onAdded: (note: MessageNote) => void;
  onChanged: (noteId: string, body: string, editedAt: string) => void;
  onRemoved: (noteId: string) => void;
}) {
  const currentUser = useCurrentUser();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function addNote() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, messageId }),
      });
      if (!res.ok) throw new Error("Failed to add note");
      const data = await res.json();
      onAdded({
        id: data.id,
        body: data.body,
        authorId: data.author?.id ?? currentUser?.id ?? "",
        authorName: data.author?.name ?? currentUser?.name ?? "",
        authorAvatarUrl: data.author?.avatarUrl ?? null,
        createdAt: data.createdAt,
        editedAt: null,
      });
      setDraft("");
      setComposing(false);
    } catch {
      toast.error("Failed to add note");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(noteId: string) {
    const body = editValue.trim();
    if (!body) return;
    try {
      const res = await fetch(`/api/comments/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error();
      onChanged(noteId, body, new Date().toISOString());
      setEditingId(null);
    } catch {
      toast.error("Failed to save note");
    }
  }

  async function removeNote(noteId: string) {
    try {
      const res = await fetch(`/api/comments/${noteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onRemoved(noteId);
    } catch {
      toast.error("Failed to delete note");
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {notes.map((n) => {
        const isAuthor = n.authorId === currentUser?.id;
        const editing = editingId === n.id;
        return (
          <div
            key={n.id}
            className="group/note rounded-md border border-amber-300/40 bg-amber-50/60 px-2.5 py-1.5 dark:border-amber-400/20 dark:bg-amber-400/5"
          >
            <div className="flex items-center gap-1.5">
              <StickyNote className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Internal note
              </span>
              <span className="font-sans text-[11px] font-medium text-pen-foreground">
                {n.authorName}
              </span>
              <span className="font-sans text-[10.5px] text-pen-subtle">
                {formatDateTime(new Date(n.createdAt))}
                {n.editedAt ? " · edited" : ""}
              </span>
              {isAuthor && !editing && (
                <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/note:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(n.id);
                      setEditValue(n.body);
                    }}
                    title="Edit note"
                    className="flex size-5 items-center justify-center rounded text-pen-subtle hover:bg-pen-card hover:text-pen-foreground"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeNote(n.id)}
                    title="Delete note"
                    className="flex size-5 items-center justify-center rounded text-pen-subtle hover:bg-pen-red/10 hover:text-pen-red"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              )}
            </div>
            {editing ? (
              <div className="mt-1 flex flex-col gap-1.5">
                <MentionTextarea
                  value={editValue}
                  onChange={setEditValue}
                  subDepartmentMembers={subDepartmentMembers}
                  rows={2}
                  autoFocus
                  onSubmit={() => void saveEdit(n.id)}
                  onCancel={() => setEditingId(null)}
                  className="w-full resize-none rounded-md border border-pen-card-border bg-pen-bg px-2 py-1.5 font-sans text-[12px] text-pen-foreground outline-none focus:border-pen-blue/50"
                />
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => saveEdit(n.id)}
                    className="h-6 rounded-md bg-pen-blue px-2.5 font-sans text-[11px] font-medium text-white dark:text-gray-900"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="h-6 rounded-md border border-pen-card-border px-2.5 font-sans text-[11px] text-pen-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap break-words pl-[18px] font-sans text-[12px] leading-[18px] text-pen-foreground">
                {renderNoteBody(n.body)}
              </p>
            )}
          </div>
        );
      })}

      {composing ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-pen-card-border bg-pen-bg px-2.5 py-2">
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            subDepartmentMembers={subDepartmentMembers}
            rows={2}
            autoFocus
            placeholder="Add an internal note — use @ to mention a teammate…"
            onSubmit={() => void addNote()}
            onCancel={() => {
              setComposing(false);
              setDraft("");
            }}
            className="w-full resize-none bg-transparent font-sans text-[12px] leading-[18px] text-pen-foreground outline-none placeholder:text-pen-subtle"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void addNote()}
              disabled={saving || !draft.trim()}
              className="flex h-6 items-center gap-1 rounded-md bg-pen-blue px-2.5 font-sans text-[11px] font-medium text-white disabled:opacity-50 dark:text-gray-900"
            >
              {saving ? <LoadingSpinner className="size-3" /> : null}
              Add note
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false);
                setDraft("");
              }}
              className="h-6 rounded-md px-2 font-sans text-[11px] text-pen-subtle hover:text-pen-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="flex w-fit items-center gap-1 rounded-md px-1 py-0.5 font-sans text-[11px] font-medium text-pen-subtle transition-colors hover:text-pen-blue"
        >
          <Plus className="size-3" />
          Add internal note
        </button>
      )}
    </div>
  );
}

/** A single customer-conversation message in the interleaved timeline. */
export function CustomerMessageItem({
  message,
  ticketId,
  subDepartmentMembers,
  onDelete,
  onNoteAdded,
  onNoteChanged,
  onNoteRemoved,
}: {
  message: MessageData;
  ticketId?: string;
  subDepartmentMembers?: MentionableUser[];
  onDelete?: (id: string) => void;
  onNoteAdded?: (messageId: string, note: MessageNote) => void;
  onNoteChanged?: (messageId: string, noteId: string, body: string, editedAt: string) => void;
  onNoteRemoved?: (messageId: string, noteId: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const outbound = message.direction === "outbound";
  const quarantined = message.status === "quarantined";
  const { visible: visibleBody, quoted: quotedBody } = useMemo(
    () => splitQuotedReply(stripImagePlaceholders(message.body)),
    [message.body],
  );

  const displayName = outbound
    ? (message.authorName ?? message.fromName)
    : message.fromName;

  const imageAttachments = message.attachments.filter((a) =>
    isImage(a.fileName),
  );
  const fileAttachments = message.attachments.filter(
    (a) => !isImage(a.fileName),
  );

  async function doDelete() {
    if (!ticketId || !onDelete) return;
    const res = await fetch(`/api/tickets/${ticketId}/messages/${message.id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete");
    onDelete(message.id);
  }

  return (
    <>
      {onDelete && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete message"
          description="This message will be permanently deleted and cannot be recovered."
          confirmLabel="Delete"
          successMessage="Message deleted"
          onConfirm={doDelete}
        />
      )}

      {/* Chat-style row — the submitter (inbound) sits left, staff replies
          (outbound) sit right, so the two sides of the conversation are obvious. */}
      <div
        className={cn(
          "group flex gap-2.5",
          outbound ? "flex-row-reverse" : "flex-row",
        )}
      >
        {/* Avatar — staff (outbound) vs submitter (inbound) get distinct colors */}
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full font-sans text-[12px] font-semibold text-white shadow-sm",
            outbound ? "bg-pen-blue" : "bg-pen-purple",
          )}
        >
          {initials(displayName)}
        </span>

        {/* Column — aligned to the sender's side */}
        <div
          className={cn(
            "flex min-w-0 max-w-[82%] flex-col",
            outbound ? "items-end" : "items-start",
          )}
        >
          {/* Name + role + time */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-0.5",
              outbound && "flex-row-reverse",
            )}
          >
            <span className="font-sans text-[12.5px] font-semibold leading-none text-pen-foreground">
              {displayName}
            </span>
            <span
              className={cn(
                "rounded-full px-1.5 py-px font-sans text-[9.5px] font-semibold uppercase tracking-wide",
                outbound
                  ? "bg-pen-blue/15 text-pen-blue"
                  : "bg-pen-purple/15 text-pen-purple",
              )}
            >
              {outbound ? "Support" : "User"}
            </span>
            {quarantined && (
              <span className="rounded-full bg-red-100 px-1.5 py-px font-sans text-[9.5px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-400">
                ⚠ Unverified
              </span>
            )}
            <span className="font-sans text-[11.5px] text-pen-subtle/70">
              {formatDateTime(new Date(message.createdAt))}
            </span>
          </div>

          {/* Message bubble */}
          <div
            className={cn(
              "mt-1 w-fit max-w-full rounded-2xl border px-3.5 py-2.5 text-left shadow-sm",
              outbound
                ? "rounded-tr-sm border-pen-blue/20 bg-pen-blue-tint"
                : "rounded-tl-sm border-pen-card-border bg-pen-surface",
            )}
          >
            {/* Body */}
            {visibleBody && (
              <div
                className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-[20px] text-pen-foreground [&_a]:text-pen-blue [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: visibleBody }}
              />
            )}

            {/* Collapsed quoted history */}
            {quotedBody && (
              <div className={cn(visibleBody && "mt-1.5")}>
                <button
                  type="button"
                  onClick={() => setShowQuote((v) => !v)}
                  title={showQuote ? "Hide quoted text" : "Show quoted text"}
                  className="inline-flex items-center gap-1 rounded-md bg-pen-bg px-1.5 py-0.5 font-sans text-[11px] text-pen-subtle transition-colors hover:text-pen-foreground"
                >
                  <span className="tracking-widest leading-none">•••</span>
                  <ChevronDown
                    className={cn(
                      "size-3 transition-transform",
                      showQuote && "rotate-180",
                    )}
                  />
                </button>
                {showQuote && (
                  <div
                    className="mt-1.5 whitespace-pre-wrap break-words border-l-2 border-pen-card-border pl-2.5 font-sans text-[12px] leading-relaxed text-pen-subtle"
                    dangerouslySetInnerHTML={{ __html: quotedBody }}
                  />
                )}
              </div>
            )}

            {/* Inline image previews */}
            {imageAttachments.length > 0 && (
              <div className={cn("flex flex-col gap-2", visibleBody && "mt-2")}>
                {imageAttachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.storageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <img
                      src={a.storageUrl}
                      alt={a.fileName}
                      className="max-h-64 max-w-full rounded-lg object-contain"
                    />
                  </a>
                ))}
              </div>
            )}

            {/* File attachments */}
            {fileAttachments.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {fileAttachments.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => downloadFile(a.storageUrl, a.fileName)}
                    title={`Download ${a.fileName}`}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-pen-card-border bg-pen-bg px-2.5 py-2 text-left transition-colors hover:border-pen-blue/40 hover:bg-pen-blue/5"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-pen-surface">
                      <FileText className="size-4 text-pen-blue" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="max-w-[220px] truncate font-sans text-[12px] font-medium text-pen-foreground">
                        {a.fileName}
                      </span>
                      {a.fileSize > 0 && (
                        <span className="font-sans text-[10.5px] text-pen-subtle">
                          {formatFileSize(a.fileSize)}
                        </span>
                      )}
                    </span>
                    <Download className="ml-auto size-3.5 shrink-0 text-pen-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Internal notes attached to this message (staff-only) */}
          {ticketId && onNoteAdded && onNoteChanged && onNoteRemoved && (
            <div className="w-full">
              <MessageNotes
                ticketId={ticketId}
                messageId={message.id}
                notes={message.notes ?? []}
                subDepartmentMembers={subDepartmentMembers}
                onAdded={(note) => onNoteAdded(message.id, note)}
                onChanged={(noteId, body, editedAt) =>
                  onNoteChanged(message.id, noteId, body, editedAt)
                }
                onRemoved={(noteId) => onNoteRemoved(message.id, noteId)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
