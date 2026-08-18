import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import { timeAgo, isToday } from "@/lib/format";

const PRIORITY_LABEL: Record<string, string> = {
  Critical: "Critical",
  Urgent: "Urgent",
  High: "High",
  Medium: "Medium",
  Low: "Low",
};

function initialsOf(name: string) {
  return name.split(/\s+/).map((p) => p.charAt(0)).join("").slice(0, 2).toUpperCase();
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json(null, { status: 401 });

  const { id } = await params;

  const n = await prisma.notification.findUnique({
    where: { id, recipientId: profile.id },
    include: {
      actor: { select: { name: true, role: true } },
      ticket: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          ticketNumber: true,
          subDepartment: { select: { prefix: true } },
        },
      },
    },
  });

  if (!n) return NextResponse.json(null, { status: 404 });

  // join_request and other ticket-less notification types
  if (!n.ticket) {
    return NextResponse.json({
      id: n.id,
      type: n.type,
      actor: n.actor?.name ?? "System",
      action: n.message ?? "sent a notification",
      detail: null,
    });
  }

  const ticket = n.ticket;
  const actorName = n.actor?.name ?? "System";
  const now = new Date();

  const comment = n.commentId
    ? await prisma.comment.findUnique({
        where: { id: n.commentId },
        select: {
          body: true,
          createdAt: true,
          author: { select: { name: true, role: true } },
        },
      })
    : null;

  const type =
    n.type === "mention"
      ? "mention"
      : n.type === "assignment"
        ? "assigned"
        : n.type === "comment"
          ? "comment"
          : n.type === "review_request"
            ? "review"
            : n.message === "closed"
              ? "closed"
              : "moved";

  const action =
    type === "mention"
      ? "mentioned you"
      : type === "assigned"
        ? "assigned you"
        : type === "comment"
          ? "commented"
          : type === "review"
            ? "requested your review"
            : (n.message ?? "updated status");

  const item = {
    id: n.id,
    type,
    actor: actorName,
    actorInitials: initialsOf(actorName),
    actorColor: avatarColorFor(actorName),
    action,
    ticketId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
    time: timeAgo(n.createdAt, now),
    createdAt: n.createdAt.toISOString(),
    unread: n.readAt === null,
    section: isToday(n.createdAt, now) ? "today" : "earlier",
    detail: {
      ticketDbId: ticket.id,
      ticketHumanId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
      status: ticket.status,
      priority: PRIORITY_LABEL[ticket.priority] ?? ticket.priority,
      title: ticket.title,
      comment: comment
        ? {
            author: comment.author.name,
            role: comment.author.role,
            time: timeAgo(comment.createdAt, now),
            body: comment.body,
            initials: initialsOf(comment.author.name),
            color: avatarColorFor(comment.author.name),
          }
        : null,
    },
  };

  return NextResponse.json(item);
}
