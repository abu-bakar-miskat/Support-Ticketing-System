import { cn } from "@/lib/utils"

/**
 * Tenant identity chip. A real logo is shown uncropped (object-contain) on a
 * clean light chip so wide/transparent logos render properly; when there's no
 * logo we fall back to the tenant initials on the default brand color. Tenants
 * customize only their logo — there is no per-tenant brand color.
 */
export function TenantAvatar({
  name,
  logoUrl,
  size = 40,
  className,
}: {
  name: string
  logoUrl?: string | null
  size?: number
  className?: string
}) {
  const initials = name.slice(0, 2).toUpperCase()

  if (logoUrl) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-pen-card-border bg-white",
          className,
        )}
        style={{ width: size, height: size, padding: Math.max(2, Math.round(size * 0.12)) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={`${name} logo`} className="max-h-full max-w-full object-contain" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-pen-blue font-sans font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.32) }}
    >
      {initials}
    </div>
  )
}
