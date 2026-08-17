import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth"
import { projectInScope } from "@/lib/dept-scope"

// POST — any authenticated user can join a project in their department scope
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const project = await prisma.project.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    select: { id: true },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Verify the project is in the user's department scope. In a cross-access-only
  // department this requires an existing ProjectMember assignment — self-join there
  // must go through an admin/manager/native-member adding them via /members instead.
  if (!(await projectInScope(profile, project.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: profile.id } },
    create: { projectId: project.id, userId: profile.id },
    update: {},
  })

  return NextResponse.json({ ok: true })
}

// DELETE — leave a project
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  await prisma.projectMember.deleteMany({
    where: { projectId: id, userId: profile.id },
  })

  return NextResponse.json({ ok: true })
}
