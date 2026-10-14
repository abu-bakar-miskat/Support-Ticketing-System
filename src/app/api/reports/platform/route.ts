import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { runAsSystem } from "@/lib/request-scope"
import { resolveReportRange } from "@/lib/report-period"
import { getSlaIndicatorViewForTicket } from "@/lib/sla-engine"
import { resolveTenantBranding } from "@/lib/tenant-branding"
import { statusCategory } from "@/lib/status-category"
import { summarizeOrganizationPerformance, type OrganizationTicketSample } from "@/lib/reporting/organization-performance"
import type { PlatformReportsResponse, PlatformTenantCardsResponse } from "@/lib/api/platform-reports"

/** Organizational summaries only: no user identities or individual performance data. */
export async function GET(request: Request) {
  const { profile, error } = await requireAuth()
  if (error) return error
  if (!profile?.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const params = new URL(request.url).searchParams
  const from = params.get("from"), to = params.get("to")
  const validDay = (value: string | null) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value)
  if (!validDay(from) || !validDay(to)) return NextResponse.json({ error: "Invalid report date range" }, { status: 400 })
  const { start, end } = resolveReportRange(from, to)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return NextResponse.json({ error: "Invalid report date range" }, { status: 400 })
  const tenantId = params.get("tenantId") ?? "all"
  const departmentId = params.get("departmentId") ?? "all"
  const subDepartmentId = params.get("subDepartmentId") ?? "all"
  if ((departmentId !== "all" && tenantId === "all") || (subDepartmentId !== "all" && departmentId === "all")) {
    return NextResponse.json({ error: "Choose the parent tenant and department first" }, { status: 400 })
  }
  return runAsSystem(async () => {
    // Landing view uses aggregate counts only. No ticket rows, hierarchy rows,
    // status configuration, or SLA evaluations are loaded until a tenant is opened.
    if (tenantId === "all") {
      const tenants = await prisma.tenant.findMany({
        where: { deletedAt: null }, orderBy: { name: "asc" },
        select: { id: true, name: true, type: true, status: true, branding: true, _count: { select: { departments: true, subDepartments: true } } },
      })
      const volumes = await prisma.ticket.groupBy({
        by: ["tenantId"],
        where: { deletedAt: null, isDraft: false, tenantId: { in: tenants.map((tenant) => tenant.id) }, createdAt: { gte: start, lt: end } },
        _count: { _all: true },
      })
      const counts = new Map(volumes.map((row) => [row.tenantId, row._count._all]))
      const response: PlatformTenantCardsResponse = { mode: "tenants", tenants: tenants.map((tenant) => ({
        id: tenant.id, name: tenant.name, type: tenant.type, status: tenant.status, logoUrl: resolveTenantBranding(tenant.branding).logoUrl,
        ticketCount: counts.get(tenant.id) ?? 0, departmentCount: tenant._count.departments, subDepartmentCount: tenant._count.subDepartments,
      })) }
      return NextResponse.json(response)
    }
    const tenants = await prisma.tenant.findMany({ where: { id: tenantId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    if (tenantId !== "all" && !tenants.some((tenant) => tenant.id === tenantId)) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    const tenantIds = [tenantId]
    const departments = await prisma.department.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true, name: true, tenantId: true }, orderBy: { name: "asc" } })
    if (departmentId !== "all" && !departments.some((department) => department.id === departmentId)) return NextResponse.json({ error: "Department not found in this tenant" }, { status: 404 })
    const subDepartments = await prisma.subDepartment.findMany({
      where: { tenantId: { in: tenantIds }, ...(departmentId !== "all" ? { departmentId } : {}) },
      select: { id: true, name: true, tenantId: true, departmentId: true }, orderBy: { name: "asc" },
    })
    if (subDepartmentId !== "all" && !subDepartments.some((sub) => sub.id === subDepartmentId)) return NextResponse.json({ error: "Subdepartment not found in this department" }, { status: 404 })
    const selectedSubs = subDepartments.filter((sub) => subDepartmentId === "all" || sub.id === subDepartmentId)
    const subIds = selectedSubs.map((sub) => sub.id)
    const [tickets, statuses] = await Promise.all([
      prisma.ticket.findMany({
        where: { deletedAt: null, isDraft: false, tenantId: { in: tenantIds }, subDepartmentId: { in: subIds }, OR: [{ createdAt: { gte: start, lt: end } }, { closedAt: { gte: start, lt: end } }] },
        select: { id: true, tenantId: true, subDepartmentId: true, status: true, createdAt: true, closedAt: true, slaTimer: { select: { id: true } } },
      }),
      prisma.subDepartmentStatus.findMany({ where: { subDepartmentId: { in: subIds } }, select: { subDepartmentId: true, label: true, category: true } }),
    ])
    const categories = new Map(statuses.map((status) => [`${status.subDepartmentId}::${status.label}`, statusCategory(status)]))
    const subById = new Map(selectedSubs.map((sub) => [sub.id, sub]))
    const samples: OrganizationTicketSample[] = []
    const now = new Date()
    for (let offset = 0; offset < tickets.length; offset += 6) {
      samples.push(...await Promise.all(tickets.slice(offset, offset + 6).map(async (ticket): Promise<OrganizationTicketSample> => {
        const complete = (categories.get(`${ticket.subDepartmentId}::${ticket.status}`) ?? statusCategory({ label: ticket.status })) === "COMPLETE"
        const sla = ticket.slaTimer ? await getSlaIndicatorViewForTicket(ticket.id, complete ? ticket.closedAt ?? now : now, { readOnly: true, includeDetails: true }) : null
        return { tenantId: ticket.tenantId, departmentId: subById.get(ticket.subDepartmentId)?.departmentId ?? "", subDepartmentId: ticket.subDepartmentId, createdAt: ticket.createdAt, closedAt: ticket.closedAt, complete,
          resolutionOutcome: !sla ? "noPolicy" : sla.resolution.status === "BREACHED" ? "breached" : complete || sla.details?.resolutionStoppedAt ? "met" : "pending" }
      })))
    }
    const selectedDepartments = departments.filter((department) => departmentId === "all" || department.id === departmentId)
    const report = summarizeOrganizationPerformance({ tenants: tenants.filter((tenant) => tenantIds.includes(tenant.id)), departments: selectedDepartments, subDepartments: selectedSubs }, samples, start, end)
    const response: PlatformReportsResponse = { ...report, tenants, departments, subDepartments }
    return NextResponse.json({ ...response, mode: "tenant" })
  })
}
