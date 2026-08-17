"use client";

import { NodeViewWrapper } from "@tiptap/react";
import { File, FileText, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { downloadFile } from "@/lib/download-file";

export function FileNodeView(props: any) {
  const { node, deleteNode, selected } = props;
  const { src, fileName, fileSize, fileType, storagePath } = node.attrs;
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadFile(src, fileName);
    } finally {
      setIsDownloading(false);
    }
  };

  const isPdf = fileType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const sizeInKb = (fileSize / 1024).toFixed(1);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Delete from storage if path is available
      if (storagePath) {
        await fetch("/api/uploads/file/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: storagePath }),
        });
      }
      // Remove from editor
      deleteNode();
      toast.success("File deleted");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete file");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <NodeViewWrapper
      className={`my-2 w-full ${selected ? "ring-2 ring-pen-id rounded-lg" : ""}`}
      as="div"
    >
      <div className="flex items-center gap-2 rounded-lg border border-pen-card-border bg-pen-card p-3 hover:border-pen-id group">
        {/* Left side - File info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isPdf ? (
            <div className="relative h-10 w-10 flex-shrink-0 rounded bg-red-100 dark:bg-red-900 flex items-center justify-center">
              <span className="text-xs font-bold text-red-600 dark:text-red-400">PDF</span>
            </div>
          ) : (
            <div className="flex-shrink-0 rounded bg-pen-surface p-2">
              <File className="size-5 text-pen-muted" />
            </div>
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <p className="text-xs font-medium text-pen-foreground truncate">{fileName}</p>
            <p className="text-xs text-pen-muted">{sizeInKb} KB</p>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-1 flex-shrink-0 transition-opacity">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="p-2 text-pen-blue hover:bg-pen-surface rounded-lg transition-colors disabled:opacity-50"
            title={`Download ${fileName}`}
          >
            {isDownloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-pen-muted hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete file"
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
