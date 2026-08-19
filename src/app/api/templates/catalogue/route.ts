import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { listCatalogueForTenant } from "@/lib/template-catalogue"

export async function GET() {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const catalogue = await listCatalogueForTenant(profile.activeTenantId ?? "__no_tenant__")
  return NextResponse.json(catalogue)
}
