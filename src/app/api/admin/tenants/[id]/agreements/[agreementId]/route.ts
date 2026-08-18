import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { updateAgreement } from "@/lib/agreements"
import type { AgreementRenewalStatus } from "@/generated/prisma/enums"

const RENEWAL_STATUSES: AgreementRenewalStatus[] = [
  "ACTIVE",
  "PENDING_RENEWAL",
  "RENEWED",
  "EXPIRED",
  "CANCELLED",
]

type Params = { params: Promise<{ id: string; agreementId: string }> }

/** PATCH /api/admin/tenants/:id/agreements/:agreementId — amend an agreement term (SA-02). */
export async function PATCH(request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id, agreementId } = await params
  const body = await request.json().catch(() => ({}))

  let startDate: Date | undefined
  if (body.startDate !== undefined) {
    startDate = new Date(body.startDate)
    if (isNaN(startDate.getTime())) return badRequest("startDate must be a valid date")
  }

  let endDate: Date | undefined
  if (body.endDate !== undefined) {
    endDate = new Date(body.endDate)
    if (isNaN(endDate.getTime())) return badRequest("endDate must be a valid date")
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

  if (
    startDate === undefined &&
    endDate === undefined &&
    renewalStatus === undefined &&
    reminderDaysBefore === undefined
  ) {
    return badRequest("Nothing to update")
  }

  const updated = await updateAgreement({
    id: agreementId,
    tenantId: id,
    startDate,
    endDate,
    renewalStatus,
    reminderDaysBefore,
    actorId: profile!.id,
  })
  if (!updated) return NextResponse.json({ error: "Agreement not found" }, { status: 404 })

  return NextResponse.json(updated)
}
