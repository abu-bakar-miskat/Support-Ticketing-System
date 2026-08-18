import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth"
import { uploadAgreementDocument } from "@/lib/storage"
import { addAgreementDocument } from "@/lib/agreements"

type Params = { params: Promise<{ id: string; agreementId: string }> }

/** POST /api/admin/tenants/:id/agreements/:agreementId/documents — attach a supporting document (SA-02). */
export async function POST(request: Request, { params }: Params) {
  const { profile, error } = await requireSuperAdmin()
  if (error) return error

  const { id, agreementId } = await params

  const formData = await request.formData().catch(() => null)
  const file = formData?.get("file") as File | null
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 })
  }

  try {
    const { url } = await uploadAgreementDocument(agreementId, file)
    const document = await addAgreementDocument({
      agreementId,
      tenantId: id,
      storageUrl: url,
      fileName: file.name,
      fileSize: file.size,
      actorId: profile!.id,
    })
    if (!document) return NextResponse.json({ error: "Agreement not found" }, { status: 404 })

    return NextResponse.json(document, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
