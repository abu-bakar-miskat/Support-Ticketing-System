"use client";

import { NodeViewWrapper } from "@tiptap/react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ImageNodeView(props: any) {
  const { node, deleteNode, selected } = props;
  const { src, alt } = node.attrs;

  const handleDelete = () => {
    try {
      deleteNode();
      toast.success("Image deleted");
    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete image");
    }
  };

  return (
    <NodeViewWrapper
      className={`my-2 inline-block ${selected ? "ring-2 ring-pen-id rounded-lg" : ""}`}
      as="div"
    >
      <div className="group relative inline-block">
        <img
          src={src}
          alt={alt}
          className="rounded-lg border border-pen-card-border max-w-full h-auto"
        />

        {/* Delete button on hover */}
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 flex items-center justify-center p-2 rounded-lg bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
          title="Delete image"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </NodeViewWrapper>
  );
}
