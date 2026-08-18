"use client";

import { useRef, useState, useEffect } from "react";
import { Paperclip, SendHorizonal, X, FileText, FileSpreadsheet, FileArchive, FileIcon } from "lucide-react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { addComment } from "@/lib/api/tickets";
import { uploadTemporaryAttachmentFile } from "@/lib/api/upload-temporary-file";
import type { MentionableUser } from "@/lib/mentionable-users";
import { UserListItem, userListPickerButtonClass } from "@/components/ui/user-list-item";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import {
  COMMENT_ATTACH_ACCEPT,
  contentTypeForFile,
  isAllowedUploadFile,
  maxBytesFor,
  maxLabelFor,
} from "@/lib/mime";

export type CommentShape = {
  id: string; body: string; createdAt: string; editedAt: string | null;
  deletedAt: string | null; authorId: string; authorName: string;
  authorAvatarUrl: string | null;
  attachments: { id: string; storageUrl: string; fileName: string; fileSize: number }[];
  replies: CommentShape[];
};

type FileEntry = { id: number; file: File; previewUrl: string | null };

let _nextId = 0;

export function CommentInput({
  ticketId,
  teamMembers = [],
  onCommentAdded,
}: {
  ticketId: string;
  teamMembers?: MentionableUser[];
  onCommentAdded?: (comment: CommentShape) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Revoke all object URLs on unmount
  const fileEntriesRef = useRef(fileEntries);
  fileEntriesRef.current = fileEntries;
  useEffect(() => {
    return () => {
      fileEntriesRef.current.forEach((e) => { if (e.previewUrl) URL.revokeObjectURL(e.previewUrl); });
    };
  }, []);

  function addFiles(files: File[]) {
    const accepted: File[] = [];
    for (const file of files) {
      if (!isAllowedUploadFile(file)) {
        toast.error(`"${file.name}" is not a supported file type`);
        continue;
      }
      const contentType = contentTypeForFile(file.name, file.type);
      const limit = maxBytesFor(contentType);
      if (file.size > limit) {
        toast.error(`"${file.name}" exceeds the ${maxLabelFor(contentType)} limit`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;
    const newEntries: FileEntry[] = accepted.map((file) => ({
      id: _nextId++,
      file,
      previewUrl: contentTypeForFile(file.name, file.type).startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    }));
    setFileEntries((prev) => [...prev, ...newEntries]);
    setError(null);
  }

  function removeFile(id: number) {
    setFileEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((e) => e.id !== id);
    });
  }

  // Show @all as first option when query matches, then matching members
  const showAll = mentionQuery !== null && "all".startsWith(mentionQuery.toLowerCase());
  const filteredMembers =
    mentionQuery !== null
      ? teamMembers.filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
      : [];
  const suggestionCount = (showAll ? 1 : 0) + filteredMembers.length;

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const { value, selectionStart } = e.target;
    const before = value.slice(0, selectionStart ?? value.length);
    const match = before.match(/@(\w*)$/);
    const newQuery = match ? match[1] : null;
    if (newQuery !== mentionQuery) setHighlightedIndex(0);
    setMentionQuery(newQuery);
  }

  function insertMention(name: string) {
    const el = textRef.current;
    if (!el) return;
    const handle = name.replace(/\s+/g, "_");
    const pos = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, pos).replace(/@[\w.-]*$/, `@${handle} `);
    const after = el.value.slice(pos);
    el.value = before + after;
    const newPos = before.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
    setMentionQuery(null);
  }

  // @all — keep as a single token; server expands to department members on save
  function insertMentionAll() {
    insertMention("all");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pastedFiles = Array.from(e.clipboardData.files);
    if (pastedFiles.length > 0) {
      e.preventDefault();
      addFiles(pastedFiles);
      return;
    }

    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const ext = file.type.split("/")[1] ?? "png";
    const named = new File([file], `pasted-image.${ext}`, { type: file.type });
    addFiles([named]);
  }

  async function doSubmit() {
    const body = textRef.current?.value.trim() ?? "";
    if (!body && fileEntries.length === 0) {
      setError("Add a comment or attach a file");
      return;
    }
    setError(null);
    setSubmitting(true);

    const filesToUpload = fileEntries;
    let uploadedAttachments: CommentShape["attachments"] = [];

    if (filesToUpload.length > 0) {
      setUploading(true);
      const results = await Promise.all(
        filesToUpload.map((entry) =>
          uploadTemporaryAttachmentFile(entry.file)
            .then((uploaded) => ({ ok: true as const, uploaded, entry }))
            .catch((err: unknown) => ({
              ok: false as const,
              entry,
              message: err instanceof Error ? err.message : "Upload failed",
            })),
        ),
      );
      setUploading(false);

      const failed = results.filter((r) => !r.ok) as {
        ok: false;
        entry: FileEntry;
        message: string;
      }[];

      if (failed.length > 0) {
        failed.forEach((r) => {
          toast.error(`"${r.entry.file.name}": ${r.message}`);
        });
        setError(
          failed.length === 1
            ? `Couldn't upload "${failed[0].entry.file.name}" — comment not posted`
            : `Couldn't upload ${failed.length} files — comment not posted`,
        );
        setSubmitting(false);
        return;
      }

      uploadedAttachments = results
        .filter((r) => r.ok)
        .map((r) => (r as { ok: true; uploaded: CommentShape["attachments"][number] }).uploaded);
    }

    let data: {
      id: string;
      body: string;
      createdAt: string;
      author?: { id: string; name: string; avatarUrl: string | null };
      attachments?: CommentShape["attachments"];
    };
    try {
      data = await addComment(ticketId, {
        body,
        hasAttachment: uploadedAttachments.length > 0,
        attachments: uploadedAttachments.map((a) => a.id),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to post comment";
      setError(message);
      toast.error(message);
      setSubmitting(false);
      return;
    }

    const comment: CommentShape = {
      id: data.id,
      body: data.body,
      createdAt: data.createdAt,
      editedAt: null,
      deletedAt: null,
      authorId: data.author?.id ?? "",
      authorName: data.author?.name ?? "",
      authorAvatarUrl: data.author?.avatarUrl ?? null,
      attachments: data.attachments ?? uploadedAttachments,
      replies: [],
    };

    onCommentAdded?.(comment);

    if (textRef.current) textRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
    filesToUpload.forEach((entry) => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    });
    setFileEntries([]);
    setSubmitting(false);
    setMentionQuery(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const suggestionsOpen = mentionQuery !== null && suggestionCount > 0;

    if (suggestionsOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % suggestionCount);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + suggestionCount) % suggestionCount);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (showAll && highlightedIndex === 0) {
          insertMentionAll();
        } else {
          const memberIdx = showAll ? highlightedIndex - 1 : highlightedIndex;
          insertMention(filteredMembers[memberIdx].name);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  }

  function fileTypeIcon(name: string) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "pdf") return <FileText className="size-[22px] text-red-400" />;
    if (["xls", "xlsx", "csv"].includes(ext)) return <FileSpreadsheet className="size-[22px] text-green-500" />;
    if (["zip", "rar", "7z", "gz"].includes(ext)) return <FileArchive className="size-[22px] text-yellow-500" />;
    if (["doc", "docx"].includes(ext)) return <FileText className="size-[22px] text-pen-blue" />;
    return <FileIcon className="size-[22px] text-pen-subtle" />;
  }

  const imageEntries = fileEntries.filter((e) => e.previewUrl);
  const fileOnlyEntries = fileEntries.filter((e) => !e.previewUrl);

  return (
    <div ref={wrapperRef} className="relative space-y-[6px]">
      <div
        className={[
          "rounded-[8px] border bg-pen-card transition-all duration-150",
          focused
            ? "border-pen-blue/50 ring-1 ring-pen-blue/30"
            : "border-pen-card-border",
        ].join(" ")}
      >
        <div>
          <textarea
            ref={textRef}
            rows={3}
            placeholder="Write a comment… use @ to mention a teammate or @all"
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="w-full resize-none rounded-t-[8px] bg-transparent px-[14px] pt-[10px] pb-[6px]
            font-sans text-[12.5px] leading-[19px] text-pen-foreground outline-none
            placeholder:text-pen-subtle"
          />
        </div>

        {/* File previews */}
        {fileEntries.length > 0 && (
          <div className="flex flex-wrap gap-[8px] px-[10px] pb-[8px]">
            {imageEntries.map((entry) => (
              <div key={entry.id} className="relative size-[90px] rounded-[6px] bg-pen-surface">
                <img
                  src={entry.previewUrl!}
                  alt={entry.file.name}
                  className="size-full rounded-[6px] object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeFile(entry.id)}
                  className="absolute -right-[5px] -top-[5px] flex size-[15px] items-center justify-center rounded-full bg-pen-surface text-pen-subtle shadow hover:text-pen-foreground"
                >
                  <X className="size-[8px]" />
                </button>
              </div>
            ))}
            {fileOnlyEntries.map((entry) => (
              <div
                key={entry.id}
                className="relative flex size-[90px] flex-col items-center justify-center gap-[5px] rounded-[6px] bg-pen-surface px-[6px]"
              >
                {fileTypeIcon(entry.file.name)}
                <span className="w-full truncate text-center font-sans text-[10px] text-pen-muted leading-tight">
                  {entry.file.name}
                </span>
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

        {/* Toolbar */}
        <div className="flex items-center justify-between border-t border-pen-card-border px-[10px] py-[7px]">
          <div className="flex flex-wrap items-center gap-[4px]">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={COMMENT_ATTACH_ACCEPT}
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) addFiles(files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Attach files"
              className="flex items-center gap-[5px] rounded-[5px] px-[8px] py-[4px] font-sans text-[11.5px] text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-muted"
            >
              <Paperclip className="size-[12px]" />
              Attach
            </button>
          </div>

          <button
            type="button"
            disabled={submitting || uploading}
            onClick={doSubmit}
            className="flex items-center gap-[6px] rounded-[6px] bg-pen-blue px-[12px] py-[5px] font-sans text-[11.5px] font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50 dark:text-gray-900"
          >
            {submitting || uploading ? (
              <>
                <LoadingSpinner className="size-[11px]" />
                {uploading ? "Uploading…" : "Posting…"}
              </>
            ) : (
              <>
                <SendHorizonal className="size-[12px]" />
                Comment
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <p className="font-sans text-[11.5px] text-pen-red">{error}</p>
      )}

      {/* @mention dropdown */}
      <AnchoredDropdown
        anchorRef={wrapperRef}
        open={mentionQuery !== null && suggestionCount > 0}
        placement="top"
        maxHeight={160}
        className="rounded-[8px] border border-pen-card-border bg-pen-bg shadow-xl backdrop-blur-xl"
      >
        <ul className="w-full">
          {/* @all option */}
          {showAll && (
            <li key="__all">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertMentionAll(); }}
                className={[
                  "w-full px-[12px] py-[7px] text-left font-sans text-[12px] text-pen-foreground transition-colors",
                  highlightedIndex === 0 ? "bg-pen-surface" : "hover:bg-pen-surface",
                ].join(" ")}
              >
                <span className="font-semibold text-pen-blue">@all</span>
                <span className="ml-2 text-pen-subtle">— mention everyone ({teamMembers.length})</span>
              </button>
            </li>
          )}
          {filteredMembers.map((m, i) => {
            const idx = showAll ? i + 1 : i;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(m.name); }}
                  className={[
                    userListPickerButtonClass,
                    "px-[10px] py-[6px] transition-colors",
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
            );
          })}
        </ul>
      </AnchoredDropdown>
    </div>
  );
}
