import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { uploadProjectIcon } from "@/lib/storage"
import { isAllowedProjectIcon } from "@/lib/project-icon"
import { canManageProjects } from "@/lib/project-permissions"

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  if (!canManageProjects(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const formData = await request.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 })

  const file = formData.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!isAllowedProjectIcon(file)) {
    return NextResponse.json({ error: "File must be an image (JPEG, PNG, GIF, WebP, or SVG)" }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 })
  }

  try {
    const { url } = await uploadProjectIcon(id, file)
    await prisma.project.update({ where: { id }, data: { avatarUrl: url } })
    return NextResponse.json({ avatarUrl: url })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error
  if (!canManageProjects(profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  await prisma.project.update({ where: { id }, data: { avatarUrl: null } })
  return NextResponse.json({ ok: true })
}
