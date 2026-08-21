import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"

// ASG-06: destinations an agent can transfer a ticket to. Any authenticated
// member may list the tenant's sub-departments (grouped by department) so they
// can move a ticket across teams/departments. The transfer endpoint itself
// re-validates the target is within the tenant, so this is a safe read.
export async function GET() {
  const { profile, error } = await requireAuth()
  if (error) return error

  const subDepartments = await prisma.subDepartment.findMany({
    where: { tenantId: profile.activeTenantId ?? "__no_tenant__" },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      prefix: true,
      department: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(
    subDepartments.map((s) => ({
      id: s.id,
      name: s.name,
      prefix: s.prefix,
      departmentId: s.department?.id ?? null,
      departmentName: s.department?.name ?? "—",
    })),
  )
}
