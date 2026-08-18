import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { badRequest } from "@/lib/api-response"
import { createAgreement, listAgreementsForTenant } from "@/lib/agreements"
import type { AgreementRenewalStatus } from "@/generated/prisma/enums"

const RENEWAL_STATUSES: AgreementRenewalStatus[] = [
  "ACTIVE",
  "PENDING_RENEWAL",
  "RENEWED",
  "EXPIRED",
  "CANCELLED",
]

type Params = { params: Promise<{ id: string }> }

/** GET /api/admin/tenants/:id/agreements — every agreement term for a tenant, newest endDate first. */
export async function GET(_request: Request, { params }: Params) {
  const { error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const agreements = await listAgreementsForTenant(id)
  return NextResponse.json(agreements)
}

/** POST /api/admin/tenants/:id/agreements — record a new agreement term (SA-02). No billing fields exist. */
export async function POST(request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } })
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

  const body = await request.json().catch(() => ({}))

  const startDate = new Date(body.startDate)
  const endDate = new Date(body.endDate)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return badRequest("startDate and endDate must be valid dates")
  }
  if (endDate <= startDate) {
    return badRequest("endDate must be after startDate")
  }

  let renewalStatus: AgreementRenewalStatus | undefined
  if (body.renewalStatus !== undefined) {
    if (!RENEWAL_STATUSES.includes(body.renewalStatus)) {
      return badRequest(`renewalStatus must be one of: ${RENEWAL_STATUSES.join(", ")}`)
    }
    renewalStatus = body.renewalStatus
  }

  let reminderDaysBefore: number[] | undefined
  if (body.reminderDaysBefore !== undefined) {
    if (
      !Array.isArray(body.reminderDaysBefore) ||
      !body.reminderDaysBefore.every((d: unknown) => typeof d === "number" && Number.isInteger(d) && d > 0)
    ) {
      return badRequest("reminderDaysBefore must be an array of positive integers")
    }
    reminderDaysBefore = body.reminderDaysBefore
  }

  const agreement = await createAgreement({
    tenantId: id,
    startDate,
    endDate,
    renewalStatus,
    reminderDaysBefore,
    actorId: profile!.id,
  })

  return NextResponse.json(agreement, { status: 201 })
}
