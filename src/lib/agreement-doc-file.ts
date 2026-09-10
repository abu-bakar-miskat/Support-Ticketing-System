/**
 * Shared constraints for Commercial Agreement supporting documents (SA-02).
 * Imported by both the client UI (to display limits + validate before upload)
 * and the server route (to enforce them), so the two never drift.
 */

export const AGREEMENT_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const AGREEMENT_DOC_MAX_LABEL = "10 MB";

/** Extensions accepted for the `accept` attribute and validation. */
export const AGREEMENT_DOC_EXTENSIONS = ["pdf", "doc", "docx", "png", "jpg", "jpeg"] as const;

/** Human-readable list shown in the upload hint. */
export const AGREEMENT_DOC_TYPES_LABEL = "PDF, Word (DOC/DOCX), or image (PNG/JPG)";

/** Value for the file input's `accept` attribute. */
export const AGREEMENT_DOC_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg";

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Returns a user-facing error message if the file violates the type or size
 * constraints, or `null` if it's acceptable.
 */
export function validateAgreementDocFile(file: { name: string; size: number }): string | null {
  const ext = extensionOf(file.name);
  if (!AGREEMENT_DOC_EXTENSIONS.includes(ext as (typeof AGREEMENT_DOC_EXTENSIONS)[number])) {
    return `Unsupported file type. Allowed: ${AGREEMENT_DOC_TYPES_LABEL}.`;
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  if (file.size > AGREEMENT_DOC_MAX_BYTES) {
    return `File is too large. Maximum size is ${AGREEMENT_DOC_MAX_LABEL}.`;
  }
  return null;
}
