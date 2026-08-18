import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { deleteAgreementDocument } from "@/lib/agreements"

type Params = { params: Promise<{ id: string; agreementId: string; documentId: string }> }

/** DELETE /api/admin/tenants/:id/agreements/:agreementId/documents/:documentId — remove a supporting document. */
export async function DELETE(_request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id, documentId } = await params

  const removed = await deleteAgreementDocument({
    documentId,
    tenantId: id,
    actorId: profile!.id,
  })
  if (!removed) return NextResponse.json({ error: "Document not found" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
