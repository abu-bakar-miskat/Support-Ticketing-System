import { Node } from "@tiptap/core";

export interface VideoNodeAttrs {
  src: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  attachmentId?: string;
  storagePath?: string;
}

export const VideoNode = Node.create({
  name: "videoNode",
  group: "block",
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      fileName: { default: "video" },
      fileSize: { default: 0 },
      fileType: { default: "video/mp4" },
      attachmentId: { default: null },
      storagePath: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type=video-node]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "video-node",
        "data-attachment-id": HTMLAttributes.attachmentId || "",
        "data-file-name": HTMLAttributes.fileName || "",
        "data-file-type": HTMLAttributes.fileType || "",
        "data-storage-path": HTMLAttributes.storagePath || "",
        ...HTMLAttributes,
      },
    ];
  },
});
