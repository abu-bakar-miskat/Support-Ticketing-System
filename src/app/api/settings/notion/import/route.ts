import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { runNotionImport, type ImportMapping } from "@/lib/notion-import"

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAdminOrManager()
  if (error) return error

  const body = await req.json()
  const { token, mapping } = body as { token: string; mapping: ImportMapping }

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token is required" }, { status: 400 })
  }
  if (!mapping?.projectsDatabaseId || !mapping?.tasksDatabaseId) {
    return NextResponse.json({ error: "projectsDatabaseId and tasksDatabaseId are required" }, { status: 400 })
  }
  if (!mapping?.teamId) {
    return NextResponse.json({ error: "teamId is required" }, { status: 400 })
  }
  if (!mapping?.projectNameProp || !mapping?.taskTitleProp) {
    return NextResponse.json({ error: "projectNameProp and taskTitleProp are required" }, { status: 400 })
  }

  const fullMapping: ImportMapping = { ...mapping, creatorId: profile.id }

  try {
    const result = await runNotionImport(token, fullMapping)
    return NextResponse.json(result)
  } catch (e: any) {
    const msg: string = e?.message ?? String(e)
    return NextResponse.json({ error: "Import failed: " + msg }, { status: 500 })
  }
}
