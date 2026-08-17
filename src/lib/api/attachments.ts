export type UploadedAttachment = {
  id: string
  storageUrl: string
  fileName: string
  fileSize: number
}

export async function uploadAttachment(
  file: File,
  meta?: { ticketId?: string; commentId?: string },
): Promise<UploadedAttachment> {
  const fd = new FormData()
  fd.append("file", file)
  if (meta?.ticketId) fd.append("ticketId", meta.ticketId)
  if (meta?.commentId) fd.append("commentId", meta.commentId)
  const res = await fetch("/api/attachments", { method: "POST", body: fd })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? "Failed to upload attachment")
  }
  return res.json()
}
