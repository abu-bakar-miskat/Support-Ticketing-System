import { NextRequest, NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { badRequest } from "@/lib/api-response"
import { reviewTemplateRequest } from "@/lib/template-catalogue"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const decision = body.decision

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return badRequest('decision must be "APPROVED" or "REJECTED"')
  }

  try {
    await reviewTemplateRequest({
      requestId: id,
      decision,
      reviewedById: profile!.id,
      reviewNote: (body.reviewNote as string | undefined)?.trim() || undefined,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
