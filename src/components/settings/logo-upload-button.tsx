"use client"

import { useRef, useState } from "react"

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml"

/**
 * Small "Upload image" control shared by every branding logo field. Uploads the
 * chosen image to the shared branding-logo endpoint and hands the resulting
 * public URL back via onUploaded so the caller can drop it into its URL field.
 */
export function LogoUploadButton({
  onUploaded,
  onError,
  disabled,
  scopeKey,
  label = "Upload image",
  className,
}: {
  onUploaded: (url: string) => void
  onError?: (message: string) => void
  disabled?: boolean
  /** Optional folder hint for storage (e.g. departmentId). */
  scopeKey?: string
  label?: string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file
    if (!file) return
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      if (scopeKey) body.append("key", scopeKey)
      const res = await fetch("/api/admin/branding-logo", { method: "POST", body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      onUploaded(data.url as string)
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onChange}
        className="hidden"
      />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        className={
          className ??
          "inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-sts-card-border bg-sts-card px-3 font-sans text-[12.5px] font-medium text-sts-foreground transition-colors hover:bg-sts-bg disabled:opacity-50"
        }
      >
        {uploading ? "Uploading…" : label}
      </button>
    </>
  )
}
