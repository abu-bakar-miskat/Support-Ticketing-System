import { Suspense } from "react";
import { redirect } from "next/navigation";
import { InboxPage, type InboxItem } from "@/components/inbox/inbox-page";
import type { JoinRequestNotification } from "@/components/inbox/join-request-item";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { avatarColorFor } from "@/lib/board-data";
import { timeAgo, isToday } from "@/lib/format";
import { InboxPageSkeleton } from "@/components/skeletons/page-skeletons";

export const metadata = { title: "Inbox — Support Ticketing System" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  developer: "Developer",
  qa: "QA",
  support: "Support",
  viewer: "Viewer",
};

const PRIORITY_LABEL: Record<string, string> = {
  Critical: "Critical",
  Urgent: "Urgent",
  High: "High",
  Medium: "Medium",
  Low: "Low",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type AuthedProfile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

async function InboxData({ profile }: { profile: AuthedProfile }) {
  const rows = await prisma.notification.findMany({
    where: {
      recipientId: profile.id,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      actor: { select: { name: true, role: true, avatarUrl: true } },
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
      joinRequest: {
        select: {
          id: true,
          status: true,
          message: true,
          subDepartmentId: true,
          subDepartment: { select: { name: true, departmentId: true } },
        },
      },
    },
  });

  const commentIds = rows.map((n) => n.commentId).filter((id): id is string => id !== null);
  const comments = commentIds.length
    ? await prisma.comment.findMany({
        where: { id: { in: commentIds } },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { name: true, role: true } },
        },
      })
    : [];
  const commentById = new Map(comments.map((c) => [c.id, c]));

  const now = new Date();

  const ticketRows = rows.filter((n) => n.type !== "join_request" && n.ticket !== null);
  const joinRequestRows = rows.filter((n) => n.type === "join_request");

  const items: InboxItem[] = ticketRows.map((n) => {
    const ticket = n.ticket!;
    const actorName = n.actor?.name ?? "System";
    const comment = n.commentId ? commentById.get(n.commentId) : undefined;

    const type =
      n.type === "mention"
        ? ("mention" as const)
        : n.type === "assignment" || n.type === "qa_assignment"
          ? ("assigned" as const)
          : n.type === "comment"
            ? ("comment" as const)
            : n.type === "review_request"
              ? ("review" as const)
              : n.type === "intake_manager_alert"
                ? ("intake" as const)
                : n.message === "closed"
                  ? ("closed" as const)
                  : ("moved" as const);

    const action =
      type === "mention"
        ? "mentioned you"
        : type === "assigned"
          ? n.type === "qa_assignment"
            ? "assigned you to QA"
            : "assigned you"
          : type === "comment"
            ? "commented"
            : type === "review"
              ? "requested your review"
              : type === "intake"
                ? "auto-created from support form"
                : (n.message ?? "updated status");

    const preview =
      type === "mention" || type === "comment"
        ? n.message
          ? `"${n.message}"`
          : undefined
        : type === "assigned"
          ? (n.message ?? ticket.title)
          : undefined;

    return {
      id: n.id,
      type,
      actor: actorName,
      actorInitials: initialsOf(actorName),
      actorColor: avatarColorFor(actorName),
      actorAvatarUrl: n.actor?.avatarUrl ?? null,
      action,
      preview,
      ticketId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
      time: timeAgo(n.createdAt, now),
      createdAt: n.createdAt.toISOString(),
      unread: n.readAt === null,
      section: isToday(n.createdAt, now) ? ("today" as const) : ("earlier" as const),
      detail: {
        ticketDbId: ticket.id,
        ticketHumanId: `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`,
        status: ticket.status,
        priority: PRIORITY_LABEL[ticket.priority] ?? ticket.priority,
        title: ticket.title,
        comment: comment
          ? {
              author: comment.author.name,
              role: ROLE_LABEL[comment.author.role] ?? comment.author.role,
              time: timeAgo(comment.createdAt, now),
              body: comment.body,
              initials: initialsOf(comment.author.name),
              color: avatarColorFor(comment.author.name),
            }
          : null,
      },
    };
  });

  const joinRequestItems: JoinRequestNotification[] = joinRequestRows.map((n) => {
    const actorName = n.actor?.name ?? "Unknown";
    const jr = n.joinRequest;

    let requestStatus: "pending" | "approved" | "rejected" | null = null;
    if (jr) {
      requestStatus = jr.status as "pending" | "approved" | "rejected";
    } else if (n.message?.startsWith("approved:")) {
      requestStatus = "approved";
    } else if (n.message?.startsWith("rejected:")) {
      requestStatus = "rejected";
    }

    return {
      id: n.id,
      actor: actorName,
      actorInitials: initialsOf(actorName),
      actorColor: avatarColorFor(actorName),
      actorAvatarUrl: n.actor?.avatarUrl ?? null,
      time: timeAgo(n.createdAt, now),
      createdAt: n.createdAt.toISOString(),
      unread: n.readAt === null,
      section: isToday(n.createdAt, now) ? ("today" as const) : ("earlier" as const),
      subDepartmentName: jr?.subDepartment?.name ?? "a team",
      subDepartmentId: jr?.subDepartmentId ?? "",
      departmentId: jr?.subDepartment?.departmentId ?? null,
      requestId: jr?.id ?? n.joinRequestId,
      requestStatus,
      message: jr?.message ?? null,
    };
  });

  return (
    <InboxPage
      items={items}
      joinRequestItems={joinRequestItems}
      currentUserInitials={initialsOf(profile.name)}
      userId={profile.id}
    />
  );
}

export default async function Page() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  return (
    <Suspense fallback={<InboxPageSkeleton />}>
      <InboxData profile={profile} />
    </Suspense>
  );
}
