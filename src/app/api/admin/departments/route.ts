import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import { requireAdmin } from "../_guard"
import { isValidDepartmentType, DEFAULT_DEPARTMENT_TYPE } from "@/lib/department-types"
import { provisionDepartmentSupportTemplate } from "@/lib/support-template"
import { runWithScope } from "@/lib/request-scope"

export async function GET() {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const departments = await prisma.department.findMany({
    where: { tenantId: profile.activeTenantId ?? "__no_tenant__" },
    orderBy: { name: "asc" },
    include: { _count: { select: { subDepartments: true } } },
  })
  return NextResponse.json(departments)
}

export async function POST(request: Request) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const body = await request.json()
  const name = (body.name as string)?.trim()
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  // The modal sends the chosen option's slug — either a built-in department type
  // (development/support/hub) or a catalogue template slug. Board behaviour still
  // keys off the built-in `type`; a catalogue slug that isn't one of the built-ins
  // falls back to the default type but is remembered as `templateSlug` so the
  // department's settings/sidebar reflect that template's features.
  const selected = ((body.templateSlug ?? body.type) as string | undefined)?.trim()
  const type = selected && isValidDepartmentType(selected) ? selected : DEFAULT_DEPARTMENT_TYPE

  // Seed the department's controllable feature allowlist from the chosen
  // template's features. Left null (uncontrolled → all features) when the
  // selection isn't a catalogue template.
  let templateSlug: string | null = null
  let featureKeys: string[] | null = null
  if (selected) {
    const tpl = await prisma.template.findUnique({
      where: { slug: selected },
      select: { slug: true, features: { select: { key: true } } },
    })
    if (tpl) {
      templateSlug = tpl.slug
      featureKeys = tpl.features.map((f) => f.key)
    }
  }

  const tenantId = profile.activeTenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No active tenant" }, { status: 400 })
  }

  // Keep isHub in sync so the existing hub-scope logic keeps working. The board
  // (five status-typed default columns) is created atomically with the
  // department so a department always has a board (DAT-03, AC-1).
  //
  // Establish the caller's scope up front from the already-resolved profile so
  // the tenant-scope extension resolves it synchronously (getRequestScope) inside
  // the transaction. Otherwise the extension falls back to getProfile() — a
  // Supabase-auth call plus a multi-query batch — while the interactive
  // transaction already holds a connection; on the small (2) pool that extra
  // in-transaction connection checkout can stall up to connectionTimeoutMillis
  // and blow the 20s transaction timeout (P2028).
  const scope = profile.isSuperAdmin
    ? { isPlatformAdmin: true, tenantIds: profile.tenantIds }
    : { tenantIds: profile.tenantIds }
  const department = await runWithScope(scope, () =>
    prisma.$transaction(async (tx) => {
      const dept = await tx.department.create({
        data: {
          name,
          tenantId,
          type,
          templateSlug,
          ...(featureKeys ? { featureKeys } : {}),
          isHub: type === "hub",
        },
      })
      return dept
    }),
  )

  // Auto-provision the support template for every new department: its Support
  // project + default email settings/templates. The default support intake form
  // is created once the department gets its first sub-department (it needs one
  // to file tickets into) — see the sub-department create route. Best-effort so
  // a provisioning hiccup never fails department creation.
  await provisionDepartmentSupportTemplate(department.id).catch((e) =>
    console.error("[POST /api/admin/departments] support template provisioning failed:", e),
  )

  return NextResponse.json(department, { status: 201 })
}
