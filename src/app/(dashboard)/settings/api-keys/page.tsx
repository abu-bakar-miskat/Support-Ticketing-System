import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { getProfile } from "@/lib/profile"
import { getProfileDeptScope } from "@/lib/dept-scope"
import {
  SettingsApiKeysPage,
  type ApiKeyRow,
  type DepartmentOption,
} from "@/components/settings/settings-api-keys-page"
import type { ApiKeyScope } from "@/generated/prisma/enums"

export const metadata = { title: "API keys — Ticketing System" }

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
  read: "read",
  read_write: "read+write",
  admin: "admin",
}

function formatRelative(date: Date | null): string {
  if (!date) return "Never"
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default async function SettingsApiKeysRoute() {
  const profile = await getProfile()
  if (!profile) redirect("/login")

  const isAdmin = profile.role === "admin"
  const isManager = profile.role === "manager"

  if (!isAdmin && !isManager) redirect("/settings")

  // For managers: get their managed departments for the key creation form
  const managedDeptIds: string[] = (profile as any).managedDepartmentIds ?? []

  const deptScope = await getProfileDeptScope(profile)
  const activeDeptId = deptScope?.activeDeptId ?? null
  const tenantId = profile.activeTenantId ?? "__no_tenant__"

  const [dbKeys, departments] = await Promise.all([
    prisma.apiKey.findMany({
      where: isAdmin
        ? activeDeptId ? { departmentId: activeDeptId } : { department: { tenantId } }
        : { departmentId: { in: managedDeptIds } },
      orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      include: {
        createdBy: { select: { name: true } },
        department: { select: { name: true } },
      },
    }),
    isAdmin
      ? prisma.department.findMany({ where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : prisma.department.findMany({
          where: { id: { in: managedDeptIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
  ])

  const apiKeys: ApiKeyRow[] = dbKeys.map((key) => ({
    id: key.id,
    name: key.name,
    maskedKey: `pen_••••${key.keySuffix}`,
    scope: SCOPE_LABELS[key.scope],
    department: key.department?.name ?? (isAdmin ? "Global" : "—"),
    created: formatRelative(key.createdAt),
    createdBy: key.createdBy.name,
    lastUsed: formatRelative(key.lastUsedAt),
    revoked: key.revokedAt !== null,
  }))

  return (
    <SettingsApiKeysPage
      apiKeys={apiKeys}
      departments={departments as DepartmentOption[]}
      isAdmin={isAdmin}
    />
  )
}
