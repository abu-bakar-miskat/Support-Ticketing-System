import "server-only"

import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { isActiveTenantAdmin } from "@/lib/tenant-admin"

export async function requirePortalKeyAdmin(keyId: string) {
  const { profile, error } = await requireAuth()
  if (error || !profile) return { profile: null, key: null, error }
  if (!isActiveTenantAdmin(profile) || !profile.activeTenantId) {
    return {
      profile: null,
      key: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }

  const key = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      tenantId: profile.activeTenantId,
      kind: "portal",
      formConfigId: { not: null },
    },
    select: {
      id: true,
      formConfigId: true,
      formConfig: { select: { id: true, departmentId: true } },
    },
  })
  if (!key?.formConfig) {
    return {
      profile: null,
      key: null,
      error: NextResponse.json({ error: "Portal key not found" }, { status: 404 }),
    }
  }
  return { profile, key: { ...key, formConfig: key.formConfig }, error: null }
}
