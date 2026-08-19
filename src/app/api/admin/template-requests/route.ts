import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import type { TemplateRequestStatus } from "@/generated/prisma/enums"

const VALID_STATUSES: readonly TemplateRequestStatus[] = ["PENDING", "APPROVED", "REJECTED"]

// Super Admin review inbox — defaults to pending requests across every tenant.
export async function GET(request: NextRequest) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const statusParam = request.nextUrl.searchParams.get("status") ?? "PENDING"
  const status = statusParam.toUpperCase()
  if (!VALID_STATUSES.includes(status as TemplateRequestStatus)) {
    return badRequest(`status must be one of: ${VALID_STATUSES.join(", ")}`)
  }

  const requests = await prisma.templateRequest.findMany({
    where: { status: status as TemplateRequestStatus },
    orderBy: { requestedAt: "asc" },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      template: { select: { id: true, name: true } },
    },
  })

  const requesters = await prisma.profile.findMany({
    where: { id: { in: requests.map((r) => r.requestedById) } },
    select: { id: true, name: true, email: true },
  })
  const requesterById = new Map(requesters.map((r) => [r.id, r]))

  return NextResponse.json(
    requests.map((r) => ({ ...r, requestedBy: requesterById.get(r.requestedById) ?? null })),
  )
}
