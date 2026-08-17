import { NextRequest, NextResponse } from "next/server";
import { requireAuth, assertTicketEditAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linkAttachmentsToTicket } from "@/lib/api/uploads";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { profile, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { attachmentIds } = await req.json();

  if (!Array.isArray(attachmentIds) || attachmentIds.length === 0) {
    return NextResponse.json({ success: true });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      teamId: true,
      projectId: true,
      assigneeId: true,
      tenantId: true,
      creatorId: true,
      deletedAt: true,
      team: { select: { departmentId: true } },
      assignees: { select: { userId: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const accessError = await assertTicketEditAccess(profile, ticket);
  if (accessError) return accessError;

  const ownedCount = await prisma.attachment.count({
    where: {
      id: { in: attachmentIds },
      uploaderProfileId: profile.id,
      status: "temporary",
      ticketId: null,
    },
  });
  if (ownedCount !== attachmentIds.length) {
    return NextResponse.json(
      { error: "One or more attachments cannot be linked to this ticket" },
      { status: 403 },
    );
  }

  try {
    await linkAttachmentsToTicket(attachmentIds, id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to link attachments";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
