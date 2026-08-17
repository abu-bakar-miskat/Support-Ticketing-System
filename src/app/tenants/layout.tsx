import { redirect } from "next/navigation"
import { getProfile } from "@/lib/profile"

export const dynamic = "force-dynamic"

/**
 * Platform-level layout for the super-admin tenants area. Deliberately neutral —
 * no tenant sidebar or branding. The tenant-scoped shell only appears once you
 * enter a tenant (the (dashboard) layout).
 */
export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!profile.isSuperAdmin) redirect("/")

  return (
    <div className="flex min-h-dvh flex-col bg-pen-bg">
      <header className="flex h-12 items-center justify-between border-b border-pen-card-border bg-pen-card px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/pen-dot.svg" alt="" width={18} height={18} className="size-[18px]" />
          <span className="font-sans text-[13px] font-semibold text-pen-foreground">Platform</span>
          <span className="font-sans text-[13px] text-pen-subtle">· Tenants</span>
        </div>
        <div className="font-sans text-[11.5px] text-pen-muted">{profile.email}</div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
