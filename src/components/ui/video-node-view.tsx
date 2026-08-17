"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { downloadFile } from "@/lib/download-file";

export function VideoNodeView(props: NodeViewProps) {
  const { node, deleteNode, selected } = props;
  const { src, fileName, fileSize, fileType, storagePath } = node.attrs;
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const sizeInMb = (fileSize / (1024 * 1024)).toFixed(1);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadFile(src, fileName);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (storagePath) {
        await fetch("/api/uploads/file/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: storagePath }),
        });
      }
      deleteNode();
      toast.success("Video deleted");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete video");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <NodeViewWrapper
      className={`my-2 w-full ${selected ? "ring-2 ring-pen-id rounded-lg" : ""}`}
      as="div"
    >
      <div className="overflow-hidden rounded-lg border border-pen-card-border bg-pen-card group">
        <video
          controls
          preload="metadata"
          src={src}
          className="max-h-[420px] w-full bg-black"
        >
          <source src={src} type={fileType} />
        </video>
        <div className="flex items-center gap-2 p-2">
          <div className="flex flex-col min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-pen-foreground">{fileName}</p>
            <p className="text-xs text-pen-muted">{sizeInMb} MB</p>
          </div>
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
                <Download className="size-4" />
              )}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-2 text-pen-muted hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete video"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
