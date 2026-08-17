"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TextSelection } from "@tiptap/pm/state";
import Image from "@tiptap/extension-image";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
  Paperclip,
  Loader2,
  Check,
  AlertCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { contentTypeForFile, maxBytesFor, maxLabelFor, uploadKind } from "@/lib/mime";
import { FileNode } from "@/lib/tiptap/file-node";
import { VideoNode } from "@/lib/tiptap/video-node";
import {
  readClipboardHtml,
  readClipboardImageFiles,
  transformPastedHtml,
  looksLikeMarkdown,
  markdownToHtml,
} from "@/lib/tiptap/paste-html";
import { FileNodeView } from "./file-node-view";
import { VideoNodeView } from "./video-node-view";
import { ImageNodeView } from "./image-node-view";
import {
  EditorContextMenu,
  type EditorContextMenuState,
} from "./editor-context-menu";
import { InsertTablePopover } from "./insert-table-popover";
import { TextColorPopover } from "./text-color-popover";
import { EditorSelectionMenu } from "./editor-selection-menu";

type UploadStatusItem = {
  id: number;
  name: string;
  status: "uploading" | "done" | "error";
  message?: string;
};

type Props = {
  content?: string | null;
  onChange?: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  contentClassName?: string;
  showAttachButton?: boolean;
  /** Extra controls rendered in the toolbar (e.g. an AI or attach button). */
  toolbarExtra?: ReactNode;
  /** Where to place `toolbarExtra` — right end (default) or left, inline with the tools. */
  toolbarExtraAlign?: "left" | "right";
};

export function RichTextEditor({
  content,
  onChange,
  placeholder = "Write something…",
  editable = true,
  className,
  contentClassName,
  showAttachButton = true,
  toolbarExtra,
  toolbarExtraAlign = "right",
}: Props) {
  const [focused, setFocused] = useState(false);
  const [uploads, setUploads] = useState<UploadStatusItem[]>([]);
  const uploadIdRef = useRef(0);
  const uploading = uploads.some((u) => u.status === "uploading");
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const uploadHandlerRef = useRef<(file: File) => void>(() => {});
  const setContextMenuRef = useRef(setContextMenu);
  setContextMenuRef.current = setContextMenu;
  const editorRef = useRef<Editor | null>(null);
  // Tracks the HTML the editor last emitted, so the sync effect below can tell
  // an external `content` change (e.g. AI streaming a description in) apart from
  // the user's own typing and avoid a feedback loop / cursor reset.
  const lastEmittedRef = useRef<string>(content || "");

  const openContextMenu = useCallback(
    (clientX: number, clientY: number, editorInstance: Editor) => {
      const coords = editorInstance.view.posAtCoords({
        left: clientX,
        top: clientY,
      });
      if (coords) {
        const selection = TextSelection.near(
          editorInstance.view.state.doc.resolve(coords.pos),
        );
        editorInstance.view.dispatch(
          editorInstance.view.state.tr.setSelection(selection),
        );
      } else {
        editorInstance.chain().focus("end").run();
      }
      setContextMenuRef.current({ x: clientX, y: clientY });
    },
    [],
  );
  const openContextMenuRef = useRef(openContextMenu);
  openContextMenuRef.current = openContextMenu;

  const finishUpload = useCallback(
    (id: number, status: "done" | "error", message?: string) => {
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, status, message } : u)),
      );
      // Success chips fade quickly; errors linger long enough to read
      setTimeout(
        () => setUploads((prev) => prev.filter((u) => u.id !== id)),
        status === "done" ? 2500 : 8000,
      );
    },
    [],
  );

  const handleFileUpload = useCallback(async (file: File, editor: Editor) => {
    const contentType = contentTypeForFile(file.name, file.type);
    const kind = uploadKind(contentType);

    const id = ++uploadIdRef.current;
    setUploads((prev) => [...prev, { id, name: file.name, status: "uploading" }]);

    if (file.size > maxBytesFor(contentType)) {
      finishUpload(id, "error", `Must be under ${maxLabelFor(contentType)}`);
      return;
    }

    try {
      // Ask the server for a signed URL, then upload the bytes straight to
      // Supabase Storage (bypasses the Vercel ~4.5 MB request-body limit).
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          size: file.size,
        }),
      });
      const signed = await signRes.json();
      if (!signRes.ok) throw new Error(signed.error ?? "Upload failed");

      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType });
      if (upErr) throw new Error(upErr.message);

      if (kind === "image") {
        editor.chain().focus().setImage({ src: signed.publicUrl }).run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent({
            type: kind === "video" ? "videoNode" : "fileNode",
            attrs: {
              src: signed.publicUrl,
              fileName: file.name,
              fileSize: file.size,
              fileType: contentType,
              attachmentId: signed.attachmentId,
              storagePath: signed.path,
            },
          })
          .run();
      }
      // The inserted node stays selected, so a following insert would replace
      // it — collapse to a caret right after the node before the next file lands.
      editor.commands.setTextSelection(editor.state.selection.to);
      finishUpload(id, "done");
    } catch (err) {
      finishUpload(id, "error", err instanceof Error ? err.message : "Upload failed");
    }
  }, [finishUpload]);

  const handleFilesUpload = useCallback(
    async (files: Iterable<File>, editor: Editor) => {
      // Sequential so files land in the order they were selected
      for (const file of files) await handleFileUpload(file, editor);
    },
    [handleFileUpload],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: {
          openOnClick: false,
          HTMLAttributes: {
            class: "text-pen-id underline underline-offset-2",
          },
        },
      }),
      Placeholder.configure({
        placeholder,
        showOnlyCurrent: true,
      }),
      TextStyle,
      Color,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "rich-img" },
      }).extend({
        addNodeView() {
          return ReactNodeViewRenderer(ImageNodeView);
        },
      }),
      FileNode.extend({
        addNodeView() {
          return ReactNodeViewRenderer(FileNodeView);
        },
      }),
      VideoNode.extend({
        addNodeView() {
          return ReactNodeViewRenderer(VideoNodeView);
        },
      }),
    ],
    content: content || "",
    editable,
    onUpdate({ editor: ed }) {
      const html = ed.isEmpty ? "" : ed.getHTML();
      lastEmittedRef.current = html;
      onChange?.(html);
    },
    onFocus() {
      setFocused(true);
    },
    onBlur() {
      setFocused(false);
    },
    immediatelyRender: false,
    editorProps: {
      handleDOMEvents: {
        contextmenu(_view, event) {
          if (!editable) return false;
          event.preventDefault();
          const ed = editorRef.current;
          if (!ed) return true;
          openContextMenuRef.current(event.clientX, event.clientY, ed);
          return true;
        },
      },
      handleClick(view, _pos, event) {
        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (coords) {
          const selection = TextSelection.near(
            view.state.doc.resolve(coords.pos),
          );
          view.dispatch(view.state.tr.setSelection(selection));
          view.focus();
          return true;
        }
        return false;
      },
      handlePaste(_view, event) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const richHtml = readClipboardHtml(clipboardData);
        const imageFiles = readClipboardImageFiles(clipboardData);

        if (!richHtml && imageFiles.length > 0) {
          imageFiles.forEach((file) => uploadHandlerRef.current(file));
          return true;
        }

        if (richHtml) {
          event.preventDefault();
          const ed = editorRef.current;
          if (ed) {
            const cleaned = transformPastedHtml(richHtml);
            if (cleaned) {
              ed.chain().focus().insertContent(cleaned).run();
            } else {
              const plain = clipboardData.getData("text/plain");
              if (plain) {
                ed.chain().focus().insertContent(plain).run();
              }
            }
          }
          return true;
        }

        // Plain-text markdown (e.g. copied from a .md file): render it with the
        // editor's design instead of pasting raw markdown syntax.
        const plain = clipboardData.getData("text/plain");
        if (plain && looksLikeMarkdown(plain)) {
          event.preventDefault();
          const ed = editorRef.current;
          if (ed) {
            const html = transformPastedHtml(markdownToHtml(plain));
            if (html) {
              ed.chain().focus().insertContent(html).run();
              return true;
            }
          }
        }

        return false;
      },
      transformPastedHTML(html) {
        return transformPastedHtml(html);
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
    if (!editor) return;
    uploadHandlerRef.current = (file: File) => handleFileUpload(file, editor);
  }, [editor, handleFileUpload]);

  // Apply external `content` changes (AI streaming, programmatic resets) into the
  // editor. Skips the user's own edits (those already match lastEmittedRef), and
  // uses emitUpdate=false so it never loops back through onUpdate → onChange.
  useEffect(() => {
    if (!editor) return;
    const incoming = content || "";
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [content, editor]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!editable || !editor) return;
      event.preventDefault();
      openContextMenu(event.clientX, event.clientY, editor);
    },
    [editable, editor, openContextMenu],
  );

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-h-[100px] flex-col rounded-lg border bg-pen-surface transition-colors",
        focused ? "border-pen-id" : "border-pen-card-border",
        className,
      )}
      data-uploading={uploading || undefined}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileUpload(file, editor);
      }}
      onContextMenu={handleContextMenu}
    >
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 overflow-visible border-b border-pen-card-border bg-pen-card px-2 py-1.5">
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <Bold className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <Italic className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor.isActive("heading", { level: 1 })}
            title="Heading 1"
          >
            <Heading1 className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive("heading", { level: 2 })}
            title="Heading 2"
          >
            <Heading2 className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive("heading", { level: 3 })}
            title="Heading 3"
          >
            <Heading3 className="size-3.5" />
          </ToolBtn>
          <div className="mx-1 h-4 w-px bg-pen-card-border" />
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet list"
          >
            <List className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered list"
          >
            <ListOrdered className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="Inline code"
          >
            <Code className="size-3.5" />
          </ToolBtn>
          <TextColorPopover editor={editor} />
          <div className="mx-1 h-4 w-px bg-pen-card-border" />
          <InsertTablePopover editor={editor} />
          <div className="mx-1 h-4 w-px bg-pen-card-border" />
          <ToolBtn
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <Undo className="size-3.5" />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <Redo className="size-3.5" />
          </ToolBtn>
          {showAttachButton && (
            <>
              <div className="mx-1 h-4 w-px bg-pen-card-border" />
              <ToolBtn
                onClick={openFilePicker}
                disabled={uploading}
                title="Add files or images"
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Paperclip className="size-3.5" />
                )}
              </ToolBtn>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) {
                handleFilesUpload(Array.from(e.target.files), editor);
              }
              e.target.value = "";
            }}
          />
          {toolbarExtra && (
            <div className={cn("flex items-center", toolbarExtraAlign === "right" ? "ml-auto" : "order-first mr-1")}>
              {toolbarExtra}
            </div>
          )}
        </div>
      )}

      {uploads.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-pen-card-border bg-pen-surface/40 px-2 py-1.5">
          {uploads.map((u) => (
            <span
              key={u.id}
              className={cn(
                "inline-flex max-w-[280px] items-center gap-1.5 rounded-full border px-2 py-0.5 font-sans text-[11px]",
                u.status === "uploading" &&
                  "border-pen-card-border bg-pen-surface text-pen-muted",
                u.status === "done" &&
                  "border-pen-green/40 bg-pen-green-tint text-pen-green",
                u.status === "error" &&
                  "border-pen-red/40 bg-pen-red-tint text-pen-red",
              )}
            >
              {u.status === "uploading" ? (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              ) : u.status === "done" ? (
                <Check className="size-3 shrink-0" />
              ) : (
                <AlertCircle className="size-3 shrink-0" />
              )}
              <span className="truncate">{u.name}</span>
              {u.status === "error" && u.message && (
                <span className="shrink-0 opacity-80">— {u.message}</span>
              )}
              {u.status === "error" && (
                <button
                  type="button"
                  onClick={() =>
                    setUploads((prev) => prev.filter((x) => x.id !== u.id))
                  }
                  className="shrink-0 transition-opacity hover:opacity-70"
                  title="Dismiss"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div
        className="flex min-h-0 flex-1 flex-col"
        onMouseDown={(e) => {
          if (!editable || (e.target as HTMLElement).closest(".ProseMirror")) {
            return;
          }
          e.preventDefault();
          const view = editor.view;
          const coords = view.posAtCoords({
            left: e.clientX,
            top: e.clientY,
          });
          if (coords) {
            const selection = TextSelection.near(
              view.state.doc.resolve(coords.pos),
            );
            view.dispatch(view.state.tr.setSelection(selection));
          } else {
            editor.chain().focus("end").run();
          }
          view.focus();
        }}
      >
        <EditorContent
          editor={editor}
          className={cn(
            "rich-text min-h-0 flex-1 overflow-x-hidden overflow-y-auto font-sans text-[13px] leading-relaxed text-pen-foreground",
            contentClassName ?? "max-h-[480px]",
          )}
        />
      </div>

      {editable && (
        <EditorContextMenu
          editor={editor}
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAttachFile={openFilePicker}
        />
      )}

      {editable && <EditorSelectionMenu editor={editor} hidden={!!contextMenu} />}
    </div>
  );
}

function ToolBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={title}
      className={cn(
        "flex size-6 items-center justify-center rounded transition-colors",
        active
          ? "bg-pen-blue-tint font-semibold text-pen-id"
          : "text-pen-muted hover:bg-pen-card hover:text-pen-foreground",
        disabled && "cursor-not-allowed opacity-30",
      )}
    >
      {children}
    </button>
  );
}

function transformFileNodesHtml(html: string): string {
  if (!html || typeof DOMParser === "undefined") return html || "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const fileNodes = doc.querySelectorAll('[data-type="file-node"]');

  fileNodes.forEach((node) => {
    const fileName = node.getAttribute("data-file-name") || "file";
    const fileType = node.getAttribute("data-file-type") || "application/octet-stream";
    const src =
      node.getAttribute("src") ||
      (node.querySelector("a") as HTMLAnchorElement)?.href ||
      "";

    const isPdf =
      fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

    const container = doc.createElement("div");
    container.className =
      "flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-card px-3 py-2 hover:border-pen-id my-2 text-xs";

    const infoDiv = doc.createElement("div");
    infoDiv.className = "flex items-center gap-2 flex-1 min-w-0";

    const iconDiv = doc.createElement("div");
    iconDiv.className = isPdf
      ? "flex-shrink-0 rounded w-8 h-8 bg-red-100 dark:bg-red-900 flex items-center justify-center text-red-600 dark:text-red-400 font-bold text-xs"
      : "flex-shrink-0 rounded bg-pen-surface p-1 text-pen-muted text-lg";
    iconDiv.textContent = isPdf ? "PDF" : "📎";

    const textDiv = doc.createElement("div");
    textDiv.className = "flex flex-col gap-0.5 min-w-0";

    const nameSpan = doc.createElement("p");
    nameSpan.className = "text-xs font-medium text-pen-foreground truncate";
    nameSpan.textContent = fileName;

    const infoSpan = doc.createElement("p");
    infoSpan.className = "text-xs text-pen-muted";
    infoSpan.textContent = "Download";

    textDiv.appendChild(nameSpan);
    textDiv.appendChild(infoSpan);

    infoDiv.appendChild(iconDiv);
    infoDiv.appendChild(textDiv);

    const downloadLink = doc.createElement("a");
    downloadLink.href = src;
    downloadLink.download = fileName;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    downloadLink.className =
      "flex-shrink-0 text-pen-blue hover:bg-pen-surface p-1.5 rounded-lg transition-colors";
    downloadLink.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
    </svg>`;

    container.appendChild(infoDiv);
    container.appendChild(downloadLink);

    node.replaceWith(container);
  });

  // Video nodes render as a bare <div data-type="video-node"> in stored HTML
  // (TipTap serializes the node's renderHTML, not the React view). Rebuild a
  // real, playable <video> element for the read-only preview.
  const videoNodes = doc.querySelectorAll('[data-type="video-node"]');
  videoNodes.forEach((node) => {
    const src = node.getAttribute("src") || "";
    const fileType = node.getAttribute("data-file-type") || "video/mp4";
    const fileName = node.getAttribute("data-file-name") || "video";
    if (!src) return;

    const container = doc.createElement("div");
    container.className =
      "my-2 overflow-hidden rounded-lg border border-pen-card-border bg-black";

    const video = doc.createElement("video");
    video.setAttribute("controls", "");
    video.setAttribute("preload", "metadata");
    video.setAttribute("src", src);
    video.className = "max-h-[420px] w-full";

    const source = doc.createElement("source");
    source.setAttribute("src", src);
    source.setAttribute("type", fileType);
    video.appendChild(source);
    video.appendChild(doc.createTextNode(fileName));

    container.appendChild(video);
    node.replaceWith(container);
  });

  return doc.body.innerHTML;
}

export function RichTextDisplay({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const [transformedHtml, setTransformedHtml] = useState<string | null>(null);
  useEffect(() => {
    setTransformedHtml(html ? transformFileNodesHtml(html) : null);
  }, [html]);

  if (!html) return null;

  return (
    <div
      className={cn(
        "rich-text font-sans text-[12.5px] leading-relaxed text-pen-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: transformedHtml ?? html }}
    />
  );
}
