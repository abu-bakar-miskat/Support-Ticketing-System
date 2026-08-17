// Shared upload type/limit rules and a reliable content-type resolver.
// Browsers frequently send an empty or generic MIME for Office files (.doc/.docx),
// markdown/text docs, and some videos, so we derive the type from the extension
// when needed. Storing the correct content-type is what keeps downloads from
// arriving broken.

export const MB = 1024 * 1024;

export const IMAGE_MAX_BYTES = 10 * MB;
export const DOC_MAX_BYTES = 50 * MB;
export const VIDEO_MAX_BYTES = 50 * MB;

const EXT_TO_MIME: Record<string, string> = {
  // Images
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  // Documents — Office
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Documents — OpenDocument
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
  // Documents — text / markup / data
  txt: "text/plain",
  md: "text/markdown",
  mdx: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  rtf: "application/rtf",
  json: "application/json",
  xml: "application/xml",
  // Archives
  zip: "application/zip",
  // Video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
};

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mpeg",
];

export const DOC_TYPES = [
  // Office
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // OpenDocument
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  // Text / markup / data
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "text/csv",
  "text/tab-separated-values",
  "application/rtf",
  "text/rtf",
  "application/json",
  "application/xml",
  "text/xml",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
];

export const ALLOWED_UPLOAD_TYPES = [...IMAGE_TYPES, ...DOC_TYPES, ...VIDEO_TYPES];

/** File picker `accept` for description / TipTap uploads — keep in sync with EXT_TO_MIME. */
export const UPLOAD_ACCEPT = [
  "image/*",
  "video/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".txt",
  ".md",
  ".mdx",
  ".markdown",
  ".csv",
  ".tsv",
  ".rtf",
  ".json",
  ".xml",
  ".zip",
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".mpeg",
  ".mpg",
].join(",");

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** File picker `accept` for comment attachments — images plus common documents. */
export const COMMENT_ATTACH_ACCEPT = [
  "image/*",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".txt",
  ".csv",
  ".rtf",
  ".md",
  ".zip",
].join(",");

/** Whether an upload is an allowed type (extension-first — browsers often omit Office MIME). */
export function isAllowedUploadFile(file: File): boolean {
  const ext = extensionOf(file.name);
  if (ext && EXT_TO_MIME[ext]) return true;
  const resolved = contentTypeForFile(file.name, file.type);
  if (resolved !== "application/octet-stream") return true;
  return !!(file.type && ALLOWED_UPLOAD_TYPES.includes(file.type));
}

/** A trustworthy content-type: prefer extension mapping when known, else browser type. */
export function contentTypeForFile(fileName: string, browserType?: string): string {
  const mapped = EXT_TO_MIME[extensionOf(fileName)];
  if (mapped) return mapped;
  if (browserType && ALLOWED_UPLOAD_TYPES.includes(browserType)) return browserType;
  return browserType || "application/octet-stream";
}

export type UploadKind = "image" | "video" | "file";

export function uploadKind(contentType: string): UploadKind {
  if (IMAGE_TYPES.includes(contentType)) return "image";
  if (VIDEO_TYPES.includes(contentType)) return "video";
  return "file";
}

/** Per-category byte cap for a resolved content-type. */
export function maxBytesFor(contentType: string): number {
  const kind = uploadKind(contentType);
  if (kind === "image") return IMAGE_MAX_BYTES;
  if (kind === "video") return VIDEO_MAX_BYTES;
  return DOC_MAX_BYTES;
}

/** Human-readable size cap label, e.g. "50 MB". */
export function maxLabelFor(contentType: string): string {
  return `${Math.round(maxBytesFor(contentType) / MB)} MB`;
}
