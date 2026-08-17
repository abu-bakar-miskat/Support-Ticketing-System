import { createClient } from "@/lib/supabase/client"
import { contentTypeForFile } from "@/lib/mime"

export type TemplateFile = {
  url: string
  path: string
  fileName: string
}

export async function uploadTemplateFile(file: File): Promise<TemplateFile> {
  const contentType = contentTypeForFile(file.name, file.type)
  const res = await fetch("/api/template-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size, contentType }),
  })
  const signed = await res.json().catch(() => ({}))
  if (!res.ok || !signed.path || !signed.token) {
    throw new Error(signed.error || "Failed to upload file")
  }

  const supabase = createClient()
  const { error } = await supabase.storage
    .from("attachments")
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType })
  if (error) throw new Error(error.message)

  return { url: signed.url, path: signed.path, fileName: signed.fileName ?? file.name }
}

export async function deleteTemplateFile(path: string): Promise<void> {
  const res = await fetch(`/api/template-files?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || "Failed to delete file")
  }
}
