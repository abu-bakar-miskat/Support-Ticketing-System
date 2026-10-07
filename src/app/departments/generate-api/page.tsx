import { redirect } from "next/navigation"
import type { ApiKeyScope } from "@/generated/prisma/enums"
import {
  SettingsApiKeysPage,
  type ApiKeyRow,
} from "@/components/settings/settings-api-keys-page"
import { prisma } from "@/lib/db"
import { isActiveTenantAdmin } from "@/lib/tenant-admin"
import { getProfile } from "@/lib/profile"
import { runAsSystem } from "@/lib/request-scope"
import type { PortalApiFormRow } from "@/components/departments/portal-api-forms-section"

export const metadata = { title: "Generate API — Global Support Portal" }

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
  read: "read",
  read_write: "portal",
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

export default async function GenerateApiPage() {
  const profile = await getProfile()
  if (!profile) redirect("/login")
  if (!isActiveTenantAdmin(profile)) redirect("/departments")
  const tenantId = profile.activeTenantId
  if (!tenantId) redirect("/departments")

  const [dbKeys, departments] = await runAsSystem(() => Promise.all([
    prisma.apiKey.findMany({
      where: { departmentId: null, tenantId, kind: "portal" },
      orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { intakes: true } },
        formConfig: {
          select: {
            id: true,
            name: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        intakeFormConfigs: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            isActive: true,
            apiKey: { select: { id: true } },
          },
        },
      },
    }),
  ]))

  const apiKeys: ApiKeyRow[] = dbKeys.map((key) => ({
    id: key.id,
    name: key.name,
    maskedKey: `pen_••••${key.keySuffix}`,
    scope: SCOPE_LABELS[key.scope],
    department: key.formConfig?.department.name ?? "—",
    created: formatRelative(key.createdAt),
    createdBy: key.createdBy.name,
    lastUsed: formatRelative(key.lastUsedAt),
    revoked: key.revokedAt !== null,
    formId: key.formConfig?.id ?? null,
    formName: key.formConfig?.name ?? null,
  }))

  const portalForms: PortalApiFormRow[] = dbKeys.flatMap((key) => {
    const form = key.formConfig
    if (key.revokedAt !== null || !form) return []
    return [{
      apiKeyId: key.id,
      form: {
        id: form.id,
        name: form.name,
        departmentName: form.department.name,
      },
      intakeCount: key._count.intakes,
    }]
  })

  return (
    <SettingsApiKeysPage
      apiKeys={apiKeys}
      departments={departments.map((department) => ({
        id: department.id,
        name: department.name,
        forms: department.intakeFormConfigs.map((form) => ({
          id: form.id,
          name: form.name,
          isActive: form.isActive,
          isConnected: form.apiKey !== null,
        })),
      }))}
      isAdmin
      portalMode
      portalForms={portalForms}
    />
  )
}
