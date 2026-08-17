import { createClient } from "@/lib/supabase/client";
import { contentTypeForFile } from "@/lib/mime";

const BUCKET = "attachments";

export type TemporaryUploadedFile = {
  id: string;
  storageUrl: string;
  fileName: string;
  fileSize: number;
};

/**
 * Stage a file before linking it to a comment or customer message.
 *
 * Uploads the bytes directly to Supabase Storage via a short-lived signed URL,
 * bypassing the ~4.5 MB Vercel serverless request-body limit (files went
 * through the API route before, which capped uploads well below the real
 * 50 MB limit).
 */
export async function uploadTemporaryAttachmentFile(
  file: File,
): Promise<TemporaryUploadedFile> {
  const contentType = contentTypeForFile(file.name, file.type);

  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      size: file.size,
      attach: true,
    }),
  });
  const signed = (await signRes.json().catch(() => ({}))) as {
    path?: string;
    token?: string;
    publicUrl?: string;
    attachmentId?: string;
    error?: string;
  };
  if (!signRes.ok || !signed.path || !signed.token) {
    throw new Error(signed.error ?? "Failed to upload attachment");
  }

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType });
  if (error) throw new Error(error.message);

  return {
    id: signed.attachmentId!,
    storageUrl: signed.publicUrl ?? "",
    fileName: file.name,
    fileSize: file.size,
  };
}
