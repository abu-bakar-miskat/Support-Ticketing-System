"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  Image,
  Film,
  Link2,
  Plus,
  Trash2,
  Upload,
  Loader2,
  ChevronRight,
  AlertCircle,
  X,
  Home,
  FolderPlus,
  ExternalLink,
  Video,
  Edit3,
  Check,
  Code,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { updateProjectAssets } from "@/lib/api/projects";
import { createClient } from "@/lib/supabase/client";
import { contentTypeForFile } from "@/lib/mime";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssetNodeType =
  | "folder"
  | "image"
  | "pdf"
  | "document"
  | "video"
  | "markdown"
  | "link";

export type AssetNode = {
  id: string;
  name: string;
  type: AssetNodeType;
  parentId: string | null;
  url?: string;       // uploaded files & links & videos
  content?: string;   // markdown inline content
  mimeType?: string;
  color?: string;     // custom color for folders
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getNodeIcon(type: AssetNodeType, open = false) {
  switch (type) {
    case "folder":    return open ? FolderOpen : Folder;
    case "image":     return Image;
    case "pdf":       return FileText;
    case "document":  return FileText;
    case "video":     return Film;
    case "markdown":  return Code;
    case "link":      return Link2;
    default:          return File;
  }
}

function getNodeColor(type: AssetNodeType) {
  switch (type) {
    case "folder":    return "#f97316";
    case "image":     return "#0a76b9";
    case "pdf":       return "#dc2626";
    case "document":  return "#7c3aed";
    case "video":     return "#059669";
    case "markdown":  return "#0891b2";
    case "link":      return "#94a3b8";
    default:          return "#6b7280";
  }
}

function inferType(mimeType: string, fileName: string): AssetNodeType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    /\.(doc|docx|odt|txt|rtf)$/i.test(fileName)
  ) return "document";
  if (mimeType.startsWith("video/")) return "video";
  if (/\.(md|mdx|markdown)$/i.test(fileName)) return "markdown";
  return "document";
}

function extractVideoEmbed(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

function canDownloadAsset(node: AssetNode): boolean {
  return !!node.url || node.type === "markdown";
}

function downloadAsset(node: AssetNode) {
  if (node.type === "markdown") {
    const blob = new Blob([node.content ?? ""], { type: "text/markdown;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = node.name.endsWith(".md") ? node.name : `${node.name}.md`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return;
  }

  if (!node.url) return;

  const anchor = document.createElement("a");
  anchor.href = node.url;
  anchor.download = node.name;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

function AssetDownloadButton({
  node,
  className,
  label,
}: {
  node: AssetNode;
  className?: string;
  label?: string;
}) {
  if (!canDownloadAsset(node)) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        downloadAsset(node);
      }}
      className={cn(
        "flex items-center gap-1 rounded-lg bg-pen-surface px-2.5 py-1.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground",
        className,
      )}
      title={`Download ${node.name}`}
    >
      <Download className="size-3" />
      {label}
    </button>
  );
}

// ── Markdown renderer (lightweight) ──────────────────────────────────────────

function renderMarkdown(md: string) {
  const lines = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .split("\n");

  let inUl = false;
  const result: string[] = [];

  for (const line of lines) {
    let l = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    if (/^### /.test(l)) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      result.push(`<h3>${l.slice(4)}</h3>`);
    } else if (/^## /.test(l)) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      result.push(`<h2>${l.slice(3)}</h2>`);
    } else if (/^# /.test(l)) {
      if (inUl) { result.push("</ul>"); inUl = false; }
      result.push(`<h1>${l.slice(2)}</h1>`);
    } else if (/^- /.test(l)) {
      if (!inUl) { result.push("<ul>"); inUl = true; }
      result.push(`<li>${l.slice(2)}</li>`);
    } else {
      if (inUl) { result.push("</ul>"); inUl = false; }
      result.push(l === "" ? "<br/>" : `<p>${l}</p>`);
    }
  }
  if (inUl) result.push("</ul>");
  return result.join("");
}

// ── Preview modal ─────────────────────────────────────────────────────────────

function PreviewModal({
  node,
  onClose,
  onSaveMarkdown,
  canEdit,
}: {
  node: AssetNode;
  onClose: () => void;
  onSaveMarkdown?: (content: string) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.content ?? "");

  function save() {
    onSaveMarkdown?.(draft);
    setEditing(false);
  }

  const embedUrl = node.type === "video" && node.url ? extractVideoEmbed(node.url) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 pen-overlay-backdrop" />
      <div
        className="relative z-10 flex max-h-[calc(90vh/var(--pen-font-scale,1))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-pen-card-border px-4 py-3">
          {(() => {
            const Icon = getNodeIcon(node.type);
            return <Icon className="size-4 shrink-0" style={{ color: getNodeColor(node.type) }} />;
          })()}
          <span className="min-w-0 flex-1 truncate font-sans text-[13px] font-semibold text-pen-foreground">
            {node.name}
          </span>
          <div className="flex items-center gap-2">
            {node.type === "markdown" && canEdit && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 rounded-lg bg-pen-surface px-2.5 py-1.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground"
              >
                <Edit3 className="size-3" /> Edit
              </button>
            )}
            {node.type === "markdown" && editing && (
              <button
                type="button"
                onClick={save}
                className="flex items-center gap-1 rounded-lg bg-pen-blue px-2.5 py-1.5 font-sans text-[11.5px] font-medium text-white dark:text-gray-900"
              >
                <Check className="size-3" /> Save
              </button>
            )}
            {node.url && node.type !== "video" && (
              <>
                <AssetDownloadButton node={node} label="Download" />
                <Link
                  href={node.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg bg-pen-surface px-2.5 py-1.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground"
                >
                  <ExternalLink className="size-3" /> Open
                </Link>
              </>
            )}
            {node.type === "markdown" && (
              <AssetDownloadButton node={node} label="Download" />
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg text-pen-subtle transition-colors hover:bg-pen-surface hover:text-pen-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto">
          {node.type === "image" && node.url && (
            <div className="flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={node.url} alt={node.name} className="max-h-[calc(70vh/var(--pen-font-scale,1))] rounded-lg object-contain" />
            </div>
          )}
          {node.type === "video" && (
            <div className="p-4">
              {embedUrl ? (
                <div className="relative w-full overflow-hidden rounded-xl" style={{ paddingBottom: "56.25%" }}>
                  <iframe
                    src={embedUrl}
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={node.name}
                  />
                </div>
              ) : node.url ? (
                <video controls className="w-full rounded-xl">
                  <source src={node.url} />
                </video>
              ) : null}
            </div>
          )}
          {node.type === "markdown" && (
            <div className="p-4">
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-80 w-full resize-y rounded-lg border border-pen-card-border bg-pen-surface p-3 font-mono text-[12.5px] text-pen-foreground outline-none focus:border-pen-id dark:bg-white/5"
                  placeholder="# Title&#10;&#10;Write markdown here…"
                />
              ) : (
                <div
                  className="prose prose-sm max-w-none font-sans text-[13px] text-pen-foreground [&_a]:text-pen-id [&_a]:underline [&_code]:rounded [&_code]:bg-pen-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11.5px] [&_h1]:mb-2 [&_h1]:text-[17px] [&_h1]:font-bold [&_h2]:mb-1.5 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ul]:mb-2"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(node.content ?? "") }}
                />
              )}
            </div>
          )}
          {(node.type === "pdf" || node.type === "document") && node.url && (
            <div className="flex flex-col items-center gap-4 p-8">
              {(() => {
                const Icon = getNodeIcon(node.type);
                return <Icon className="size-16 opacity-30" style={{ color: getNodeColor(node.type) }} />;
              })()}
              <p className="font-sans text-[13px] text-pen-muted">{node.name}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <AssetDownloadButton
                  node={node}
                  label="Download"
                  className="bg-pen-blue px-4 py-2 font-medium text-white hover:text-white dark:text-gray-900"
                />
                <Link
                  href={node.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-4 py-2 font-sans text-[12.5px] font-medium text-pen-foreground transition-colors hover:border-pen-id/40"
                >
                  <ExternalLink className="size-4" /> Open file
                </Link>
              </div>
            </div>
          )}
          {node.type === "link" && node.url && (
            <div className="flex flex-col items-center gap-4 p-8">
              <Link2 className="size-12 opacity-30 text-pen-subtle" />
              <p className="font-sans text-[13px] text-pen-muted break-all">{node.url}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <AssetDownloadButton
                  node={node}
                  label="Download"
                  className="bg-pen-blue px-4 py-2 font-medium text-white hover:text-white dark:text-gray-900"
                />
                <Link
                  href={node.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-surface px-4 py-2 font-sans text-[12.5px] font-medium text-pen-foreground transition-colors hover:border-pen-id/40"
                >
                  <ExternalLink className="size-4" /> Open link
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add panel ─────────────────────────────────────────────────────────────────

type AddMode = "folder" | "link" | "video" | "markdown" | null;

function AddPanel({
  mode,
  onClose,
  onAdd,
}: {
  mode: AddMode;
  onClose: () => void;
  onAdd: (partial: Omit<AssetNode, "id" | "parentId" | "createdAt">) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [folderColor, setFolderColor] = useState("#f97316");
  const [addedCount, setAddedCount] = useState(0);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const FOLDER_COLORS = [
    "#f97316", // orange (default)
    "#ef4444", // red
    "#f59e0b", // amber
    "#22c55e", // green
    "#0ea5e9", // sky
    "#6366f1", // indigo
    "#a855f7", // purple
    "#ec4899", // pink
    "#14b8a6", // teal
    "#64748b", // slate
  ];

  function submit() {
    const trimName = name.trim();
    const trimUrl = url.trim();

    if (!trimName) return;
    if ((mode === "link" || mode === "video") && !trimUrl) return;

    if (mode === "folder") {
      onAdd({ name: trimName, type: "folder", color: folderColor });
    } else if (mode === "link") {
      // Stay open so several links can be added in a row
      onAdd({ name: trimName, type: "link", url: trimUrl });
      setName("");
      setUrl("");
      setAddedCount((c) => c + 1);
      nameInputRef.current?.focus();
      return;
    } else if (mode === "video") {
      onAdd({ name: trimName, type: "video", url: trimUrl });
    } else if (mode === "markdown") {
      onAdd({ name: trimName.endsWith(".md") ? trimName : `${trimName}.md`, type: "markdown", content });
    }
    onClose();
  }

  const titles: Record<NonNullable<AddMode>, string> = {
    folder: "New folder",
    link: "Add link",
    video: "Embed video",
    markdown: "New markdown doc",
  };

  const placeholders: Record<NonNullable<AddMode>, string> = {
    folder: "e.g. Design files",
    link: "e.g. Staging dashboard",
    video: "e.g. Demo walkthrough",
    markdown: "e.g. README",
  };

  const icons: Record<NonNullable<AddMode>, React.ElementType> = {
    folder: FolderPlus,
    link: Link2,
    video: Video,
    markdown: Code,
  };

  const TitleIcon = icons[mode!];

  return (
    <div className="overflow-hidden rounded-2xl border border-pen-card-border bg-pen-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-pen-card-border bg-pen-surface/60 px-4 py-3 dark:bg-white/5">
        <TitleIcon className="size-4 shrink-0 text-pen-id" />
        <p className="flex-1 font-sans text-[13px] font-semibold text-pen-foreground">
          {titles[mode!]}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-pen-subtle transition-colors hover:bg-pen-card-border hover:text-pen-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-[11.5px] font-medium text-pen-subtle">
            {mode === "folder" ? "Folder name" : mode === "markdown" ? "Document name" : "Name"}
          </label>
          <input
            ref={nameInputRef}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
            placeholder={placeholders[mode!]}
            className="h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id dark:bg-white/5"
          />
        </div>
        {mode === "folder" && (
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[11.5px] font-medium text-pen-subtle">Color</label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFolderColor(c)}
                  className={cn(
                    "size-6 rounded-full transition-transform hover:scale-110",
                    folderColor === c && "ring-2 ring-offset-2 ring-offset-pen-card scale-110",
                  )}
                  style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
                />
              ))}
            </div>
          </div>
        )}
        {(mode === "link" || mode === "video") && (
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[11.5px] font-medium text-pen-subtle">
              {mode === "video" ? "Video URL" : "URL"}
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={mode === "video" ? "https://youtube.com/watch?v=… or Vimeo" : "https://…"}
              className="h-9 rounded-lg border border-pen-card-border bg-pen-surface px-3 font-sans text-[13px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id dark:bg-white/5"
            />
          </div>
        )}
        {mode === "markdown" && (
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[11.5px] font-medium text-pen-subtle">
              Content <span className="normal-case text-pen-subtle/60">(optional — you can edit after creating)</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="# Title&#10;&#10;Write markdown here…"
              className="resize-none rounded-lg border border-pen-card-border bg-pen-surface px-3 py-2.5 font-mono text-[12px] text-pen-foreground outline-none placeholder:text-pen-subtle focus:border-pen-id dark:bg-white/5"
            />
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center gap-2 pt-1">
          {mode === "link" && addedCount > 0 && (
            <p className="font-sans text-[11.5px] text-pen-green">
              {addedCount} link{addedCount === 1 ? "" : "s"} added
            </p>
          )}
          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-pen-card-border px-4 font-sans text-[12.5px] text-pen-muted transition-colors hover:bg-pen-surface hover:text-pen-foreground"
            >
              {mode === "link" && addedCount > 0 ? "Done" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!name.trim() || ((mode === "link" || mode === "video") && !url.trim())}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-pen-blue px-4 font-sans text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 dark:text-gray-900"
            >
              <Plus className="size-3.5" />
              {mode === "folder" ? "Create folder" : mode === "markdown" ? "Create doc" : mode === "link" ? "Add link" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main asset manager ────────────────────────────────────────────────────────

export function ProjectAssetManager({
  projectId,
  initialNodes,
  canAdd,
  canDelete,
}: {
  projectId: string;
  initialNodes: AssetNode[];
  canAdd: boolean;
  canDelete: boolean;
}) {
  const [nodes, setNodes] = useState<AssetNode[]>(initialNodes);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [previewNode, setPreviewNode] = useState<AssetNode | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function persist(updated: AssetNode[]) {
    setNodes(updated);
    await updateProjectAssets(projectId, updated);
  }

  // Build breadcrumb path
  function buildPath(folderId: string | null): AssetNode[] {
    const path: AssetNode[] = [];
    let id = folderId;
    while (id) {
      const node = nodes.find((n) => n.id === id);
      if (!node) break;
      path.unshift(node);
      id = node.parentId;
    }
    return path;
  }

  const breadcrumb = buildPath(currentFolderId);
  const currentItems = nodes.filter((n) => n.parentId === currentFolderId);
  const folders = currentItems.filter((n) => n.type === "folder").sort((a, b) => a.name.localeCompare(b.name));
  const files = currentItems.filter((n) => n.type !== "folder").sort((a, b) => a.name.localeCompare(b.name));

  async function uploadFiles(fileList: FileList) {
    setUploading(true);
    setUploadError(null);
    const results: AssetNode[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const contentType = contentTypeForFile(file.name, file.type);
        const res = await fetch("/api/projects/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, fileName: file.name, size: file.size, contentType }),
        });
        const signed = await res.json();
        if (!res.ok) throw new Error(signed.error ?? "Upload failed");

        const supabase = createClient();
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType });
        if (upErr) throw new Error(upErr.message);

        results.push({
          id: uid(),
          name: file.name,
          type: inferType(file.type, file.name),
          parentId: currentFolderId,
          url: signed.publicUrl,
          mimeType: file.type,
          createdAt: new Date().toISOString(),
        });
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
      }
    }
    if (results.length > 0) {
      await persist([...nodes, ...results]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addNode(partial: Omit<AssetNode, "id" | "parentId" | "createdAt">) {
    const node: AssetNode = {
      ...partial,
      id: uid(),
      parentId: currentFolderId,
      createdAt: new Date().toISOString(),
    };
    persist([...nodes, node]);
  }

  async function deleteNode(id: string) {
    // Delete node and all descendants
    const toDelete = new Set<string>();
    const queue = [id];
    while (queue.length) {
      const cur = queue.pop()!;
      toDelete.add(cur);
      nodes.filter((n) => n.parentId === cur).forEach((n) => queue.push(n.id));
    }
    await persist(nodes.filter((n) => !toDelete.has(n.id)));
  }

  function startRename(node: AssetNode) {
    setRenamingId(node.id);
    setRenameValue(node.name);
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingId(null); return; }
    await persist(nodes.map((n) => n.id === id ? { ...n, name: trimmed } : n));
    setRenamingId(null);
  }

  async function saveMarkdown(nodeId: string, content: string) {
    await persist(nodes.map((n) => n.id === nodeId ? { ...n, content } : n));
    setPreviewNode((prev) => prev?.id === nodeId ? { ...prev, content } : prev);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Breadcrumb + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <button
            type="button"
            onClick={() => setCurrentFolderId(null)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground"
          >
            <Home className="size-3.5" />
          </button>
          {breadcrumb.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="size-3 shrink-0 text-pen-subtle" />
              <button
                type="button"
                onClick={() => setCurrentFolderId(b.id)}
                className="max-w-[120px] truncate rounded-md px-1.5 py-0.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground"
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>

        {/* Action buttons */}
        {canAdd && (
          <div className="flex shrink-0 flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setAddMode(addMode === "folder" ? null : "folder")}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-sans text-[11.5px] transition-colors",
                addMode === "folder"
                  ? "border-pen-id bg-pen-blue-tint font-semibold text-pen-id"
                  : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground dark:bg-white/5",
              )}
            >
              <FolderPlus className="size-3.5" /> Folder
            </button>
            <button
              type="button"
              onClick={() => !uploading && fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 rounded-lg border border-pen-card-border bg-pen-surface px-2.5 py-1.5 font-sans text-[11.5px] text-pen-muted transition-colors hover:text-pen-foreground disabled:opacity-50 dark:bg-white/5"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              Upload
            </button>
            <button
              type="button"
              onClick={() => setAddMode(addMode === "video" ? null : "video")}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-sans text-[11.5px] transition-colors",
                addMode === "video"
                  ? "border-pen-id bg-pen-blue-tint font-semibold text-pen-id"
                  : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground dark:bg-white/5",
              )}
            >
              <Video className="size-3.5" /> Video
            </button>
            <button
              type="button"
              onClick={() => setAddMode(addMode === "markdown" ? null : "markdown")}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-sans text-[11.5px] transition-colors",
                addMode === "markdown"
                  ? "border-pen-id bg-pen-blue-tint font-semibold text-pen-id"
                  : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground dark:bg-white/5",
              )}
            >
              <Code className="size-3.5" /> Markdown
            </button>
            <button
              type="button"
              onClick={() => setAddMode(addMode === "link" ? null : "link")}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-sans text-[11.5px] transition-colors",
                addMode === "link"
                  ? "border-pen-id bg-pen-blue-tint font-semibold text-pen-id"
                  : "border-pen-card-border bg-pen-surface text-pen-muted hover:text-pen-foreground dark:bg-white/5",
              )}
            >
              <Link2 className="size-3.5" /> Link
            </button>
          </div>
        )}
      </div>

      {/* Add panel */}
      {addMode && canAdd && (
        <AddPanel
          mode={addMode}
          onClose={() => setAddMode(null)}
          onAdd={addNode}
        />
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 font-sans text-[11.5px] text-red-500">
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="flex-1">{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)}>
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Drop zone + file grid */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (canAdd) setIsDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (canAdd && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col rounded-xl border-2 transition-colors",
          isDragOver
            ? "border-pen-blue bg-pen-blue/5"
            : "border-dashed border-pen-card-border bg-pen-surface/30 dark:bg-white/3",
        )}
      >
        {/* Upload overlay */}
        {uploading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[10px] bg-pen-surface/80 backdrop-blur-sm dark:bg-pen-bg/70">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-pen-card-border bg-pen-card shadow-lg">
              <Loader2 className="size-7 animate-spin text-pen-id" />
            </div>
            <p className="font-sans text-[13px] font-semibold text-pen-foreground">Uploading…</p>
          </div>
        )}
        {folders.length === 0 && files.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            {canAdd ? (
              <>
                <Upload className="size-10 text-pen-subtle/40" />
                <p className="font-sans text-[13px] text-pen-subtle">
                  Drop files here or use the buttons above
                </p>
              </>
            ) : (
              <p className="font-sans text-[13px] text-pen-subtle">No files in this folder.</p>
            )}
          </div>
        ) : (
          <div className="overflow-y-auto p-3">
            {/* Folders first */}
            {folders.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 pen-text-label text-pen-subtle/70">
                  Folders
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {folders.map((node) => (
                    <FolderCard
                      key={node.id}
                      node={node}
                      canDelete={canDelete}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      setRenameValue={setRenameValue}
                      onOpen={() => setCurrentFolderId(node.id)}
                      onStartRename={() => startRename(node)}
                      onCommitRename={() => commitRename(node.id)}
                      onDelete={() => deleteNode(node.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {files.length > 0 && (
              <div>
                <p className="mb-1.5 pen-text-label text-pen-subtle/70">
                  Files
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {files.map((node) => (
                    <FileCard
                      key={node.id}
                      node={node}
                      canDelete={canDelete}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      setRenameValue={setRenameValue}
                      onOpen={() => setPreviewNode(node)}
                      onStartRename={() => startRename(node)}
                      onCommitRename={() => commitRename(node.id)}
                      onDelete={() => deleteNode(node.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx,.odt,.txt,.rtf,.md,.mdx,.mp4,.mov,.webm"
        className="sr-only"
        onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); }}
      />

      {/* Preview modal */}
      {previewNode && (
        <PreviewModal
          node={previewNode}
          onClose={() => setPreviewNode(null)}
          onSaveMarkdown={canDelete ? (c) => saveMarkdown(previewNode.id, c) : undefined}
          canEdit={canDelete}
        />
      )}
    </div>
  );
}

// ── Folder card ───────────────────────────────────────────────────────────────

function FolderCard({
  node,
  canDelete,
  renamingId,
  renameValue,
  setRenameValue,
  onOpen,
  onStartRename,
  onCommitRename,
  onDelete,
}: {
  node: AssetNode;
  canDelete: boolean;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onOpen: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onDelete: () => void;
}) {
  const isRenaming = renamingId === node.id;

  return (
    <div
      className="group relative flex flex-col items-center gap-2 rounded-xl border border-pen-card-border bg-pen-card p-4 transition-colors"
      style={{ ["--folder-color" as string]: node.color ?? "#f97316" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${node.color ?? "#f97316"}80`)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
    >
      <button type="button" onClick={onOpen} className="flex flex-col items-center gap-1.5 w-full">
        <Folder className="size-14" style={{ color: node.color ?? "#f97316" }} />
      </button>
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => e.key === "Enter" && onCommitRename()}
          className="w-full rounded border border-pen-id bg-pen-surface px-1 py-0.5 text-center font-sans text-[11.5px] text-pen-foreground outline-none"
        />
      ) : (
        <span
          className="w-full truncate text-center font-sans text-[11.5px] text-pen-foreground"
          onDoubleClick={canDelete ? onStartRename : undefined}
          title={node.name}
        >
          {node.name}
        </span>
      )}
      {canDelete && (
        <div className="absolute right-1 top-1 flex flex-col gap-0.5">
          <button
            type="button"
            onClick={onDelete}
            className="flex size-5 items-center justify-center rounded bg-red-500/15 text-red-500 hover:bg-red-500/25"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── File card ─────────────────────────────────────────────────────────────────

function FileCard({
  node,
  canDelete,
  renamingId,
  renameValue,
  setRenameValue,
  onOpen,
  onStartRename,
  onCommitRename,
  onDelete,
}: {
  node: AssetNode;
  canDelete: boolean;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onOpen: () => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onDelete: () => void;
}) {
  const Icon = getNodeIcon(node.type);
  const color = getNodeColor(node.type);
  const isRenaming = renamingId === node.id;

  return (
    <div className="group relative flex flex-col items-center gap-2 rounded-xl border border-pen-card-border bg-pen-card p-4 transition-colors hover:border-pen-id/40">
      <button type="button" onClick={onOpen} className="flex flex-col items-center gap-1.5 w-full">
        {node.type === "image" && node.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={node.url}
            alt={node.name}
            className="h-20 w-full rounded-lg object-cover"
          />
        ) : (
          <Icon className="size-14" style={{ color }} />
        )}
      </button>
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => e.key === "Enter" && onCommitRename()}
          className="w-full rounded border border-pen-id bg-pen-surface px-1 py-0.5 text-center font-sans text-[11.5px] text-pen-foreground outline-none"
        />
      ) : (
        <span
          className="w-full truncate text-center font-sans text-[11.5px] text-pen-foreground"
          onDoubleClick={canDelete ? onStartRename : undefined}
          title={node.name}
        >
          {node.name}
        </span>
      )}
      {(canDownloadAsset(node) || canDelete) && (
        <div className="absolute right-1 top-1 flex flex-col gap-0.5">
          {canDownloadAsset(node) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadAsset(node);
              }}
              className="flex size-5 items-center justify-center rounded bg-pen-blue/15 text-pen-blue hover:bg-pen-blue/25"
              title={`Download ${node.name}`}
            >
              <Download className="size-3" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex size-5 items-center justify-center rounded bg-red-500/15 text-red-500 hover:bg-red-500/25"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
