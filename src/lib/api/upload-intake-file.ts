import { createClient } from "@/lib/supabase/client";
import { contentTypeForFile } from "@/lib/mime";

const BUCKET = "attachments";

/**
 * Upload a public intake-form attachment.
 *
 * Asks the server for a signed URL, then uploads the bytes straight to Supabase
 * Storage — bypassing the ~4.5 MB Vercel serverless request-body limit. Returns
 * the public URL of the stored file.
 */
export async function uploadIntakeFile(file: File, formId: string): Promise<string> {
  const contentType = contentTypeForFile(file.name, file.type);

  const res = await fetch("/api/intake/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      formId,
      fileName: file.name,
      contentType,
      size: file.size,
    }),
  });
  const signed = (await res.json().catch(() => ({}))) as {
    path?: string;
    token?: string;
    publicUrl?: string;
    error?: string;
  };
  if (!res.ok || !signed.path || !signed.token) {
    throw new Error(signed.error ?? "Upload failed");
  }

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType });
  if (error) throw new Error(error.message);

  return signed.publicUrl ?? "";
}
