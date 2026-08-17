import { NextRequest, NextResponse } from "next/server"
import { requireAdminOrManager } from "@/lib/auth"
import { previewNotionDatabases } from "@/lib/notion-import"

export async function POST(req: NextRequest) {
  const { error } = await requireAdminOrManager()
  if (error) return error

  const { token } = await req.json()
  if (!token || typeof token !== "string" || (!token.startsWith("secret_") && !token.startsWith("ntn_"))) {
    return NextResponse.json(
      { error: "Invalid token. Notion integration tokens start with secret_ or ntn_" },
      { status: 400 },
    )
  }

  try {
    const databases = await previewNotionDatabases(token)
    return NextResponse.json({ databases })
  } catch (e: any) {
    const msg: string = e?.message ?? String(e)
    if (msg.includes("unauthorized") || msg.includes("401")) {
      return NextResponse.json({ error: "Token is invalid or has been revoked" }, { status: 401 })
    }
    return NextResponse.json({ error: "Failed to connect to Notion: " + msg }, { status: 502 })
  }
}
