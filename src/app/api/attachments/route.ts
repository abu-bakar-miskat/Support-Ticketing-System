import { NextRequest, NextResponse } from "next/server"
import { requireAuth, assertTicketAccess, assertTicketEditAccess } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import {
  contentTypeForFile,
  isAllowedUploadFile,
  maxBytesFor,
  maxLabelFor,
} from "@/lib/mime"

function sanitizeFileName(name: string) {
  // Strip any path components and characters unsafe for storage keys
  const base = name.split(/[\\/]/).pop() ?? "file"
  return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 200) || "file"
}

export async function POST(request: NextRequest) {
  const { profile, error } = await requireAuth()
  if (error) return error

  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const ticketId = formData.get("ticketId") as string | null
  const commentId = (formData.get("commentId") as string | null) || null

  if (!ticketId) {
    return NextResponse.json({ error: "ticketId is required" }, { status: 400 })
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }
  if (!isAllowedUploadFile(file)) {
    return NextResponse.json({ error: "File type is not supported" }, { status: 415 })
  }

  const contentType = contentTypeForFile(file.name, file.type)
  const sizeLimit = maxBytesFor(contentType)
  if (file.size > sizeLimit) {
    return NextResponse.json(
      { error: `File exceeds the ${maxLabelFor(contentType)} limit` },
      { status: 413 },
    )
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      subDepartmentId: true,
      projectId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      subDepartment: { select: { departmentId: true } },
      assignees: { select: { userId: true } },
    },
  })
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 })
  }

  if (commentId) {
    const accessError = await assertTicketAccess(profile, ticket, { forWrite: true })
    if (accessError) return accessError
  } else {
    // Ticket-level attachments (sidebar uploads) and description embeds both
    // require the same edit permission as changing the description body.
    const accessError = await assertTicketEditAccess(profile, ticket)
    if (accessError) return accessError
  }

  // A supplied commentId must belong to this ticket
  if (commentId) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { ticketId: true },
    })
    if (!comment || comment.ticketId !== ticketId) {
      return NextResponse.json(
        { error: "commentId does not belong to this ticket" },
        { status: 400 },
      )
    }
  }

  const storagePath = `${ticketId}/${Date.now()}-${sanitizeFileName(file.name)}`

  const supabase = await createClient()
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, file, { upsert: false, contentType })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("attachments").getPublicUrl(uploadData.path)

  const attachment = await prisma.attachment.create({
    data: {
      ticketId,
      commentId,
      uploaderProfileId: profile.id,
      storageUrl: publicUrl,
      fileName: file.name,
      fileSize: file.size,
    },
  })

  await prisma.activityLog.create({
    data: {
      ticketId,
      actorId: profile.id,
      action: "ATTACHMENT_ADDED",
      metadata: { fileName: file.name, attachmentId: attachment.id, storageUrl: publicUrl },
    },
  })

  return NextResponse.json(attachment, { status: 201 })
}
