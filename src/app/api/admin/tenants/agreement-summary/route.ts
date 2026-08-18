import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { listTenantAgreementSummaries } from "@/lib/agreements"

const SORTABLE_FIELDS = new Set([
  "tenantName",
  "tenantStatus",
  "agreementEndDate",
  "renewalStatus",
  "departmentCount",
  "activeUserCount",
])

/**
 * GET /api/admin/tenants/agreement-summary — SA-05: per-tenant status,
 * agreement end date, department count and active-user count, filterable by
 * renewal status and sortable by any summary field.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const sp = request.nextUrl.searchParams
  const renewalStatusFilter = sp.get("renewalStatus")
  const sortBy = sp.get("sortBy")
  const sortDir = sp.get("sortDir") === "desc" ? -1 : 1

  let rows = await listTenantAgreementSummaries()

  if (renewalStatusFilter) {
    rows = rows.filter((row) => row.renewalStatus === renewalStatusFilter)
  }

  if (sortBy && SORTABLE_FIELDS.has(sortBy)) {
    const key = sortBy as keyof typeof rows[number]
    rows = [...rows].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1
      if (bv === null || bv === undefined) return -1
      if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * sortDir
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir
      return String(av).localeCompare(String(bv)) * sortDir
    })
  }

  return NextResponse.json(rows)
}
