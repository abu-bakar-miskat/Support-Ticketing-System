import { Node } from "@tiptap/core";

export interface FileNodeAttrs {
  src: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  attachmentId?: string;
  storagePath?: string;
}

export const FileNode = Node.create({
  name: "fileNode",
  group: "block",
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      fileName: { default: "file" },
      fileSize: { default: 0 },
      fileType: { default: "application/octet-stream" },
      attachmentId: { default: null },
      storagePath: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type=file-node]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "file-node",
        "data-attachment-id": HTMLAttributes.attachmentId || "",
        "data-file-name": HTMLAttributes.fileName || "",
        "data-file-type": HTMLAttributes.fileType || "",
        "data-storage-path": HTMLAttributes.storagePath || "",
        ...HTMLAttributes,
      },
    ];
  },
});
