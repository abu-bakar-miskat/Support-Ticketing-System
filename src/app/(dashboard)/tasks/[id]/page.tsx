import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import { TicketDetailPage } from "@/components/tickets/ticket-detail-page";
import { BreadcrumbRegistrar } from "@/components/dashboard/breadcrumb-registrar";
import { ActiveDeptSync } from "@/components/tickets/active-dept-sync";
import { TicketAccessDenied } from "@/components/tickets/ticket-access-denied";
import {
  getAssignableUsersForTicketDepartment,
  getCachedSubDepartmentStatuses,
  getCachedMentionableUsers,
} from "@/lib/ticket-detail-data";
import { getProfileDeptScope } from "@/lib/dept-scope";
import { canEditTicket, canEditTicketDescription, canDeleteTicket } from "@/lib/ticket-date-permissions";
import { canCrossAccessGuestViewTicket, buildTicketEditContext, isLimitedCrossAccessToDept } from "@/lib/cross-access";
import { isDueOverdue, isBlockedStatus } from "@/lib/format";
import { serializeTicketDateIso } from "@/lib/ticket-datetime";
import type { UiPriority } from "@/components/board/board-types";
import { buildGitHubDevData } from "@/lib/github/dev-data";
import { RESEND_RECEIVING_ENABLED } from "@/lib/email-config";

const PRIORITY_TO_UI: Record<string, UiPriority> = {
  Critical: "critical",
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
};

// Plain function (not a component) so the react-hooks purity rule allows Date.now
function ticketTimes(createdAt: Date, dueDate: Date | null, status: string) {
  const now = Date.now();
  return {
    openedDaysAgo: Math.max(
      0,
      Math.floor((now - createdAt.getTime()) / 86_400_000),
    ),
    dueOverdue: isDueOverdue(dueDate, new Date(now)) && !isBlockedStatus(status),
  };
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getProfile();
  if (!profile) redirect("/login");

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      subDepartment: {
        select: {
          id: true,
          prefix: true,
          name: true,
          departmentId: true,
          department: { select: { name: true } },
        },
      },
      project: {
        select: {
          name: true,
          color: true,
          kind: true,
          departmentId: true,
          moduleSystemEnabled: true,
        },
      },
      module: { select: { id: true, name: true } },
      sprint: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      assignees: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      estimates: {
        select: { userId: true, estimatedMinutes: true, targetDate: true },
      },
      parent: {
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          subDepartment: { select: { prefix: true } },
        },
      },
      subTickets: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: {
          subDepartment: { select: { prefix: true } },
          assignee: { select: { name: true, avatarUrl: true } },
        },
      },
      comments: {
        // messageId: null → exclude internal notes attached to a specific
        // customer message; those render under their message, not here.
        where: { parentId: null, messageId: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          attachments: {
            select: {
              id: true,
              storageUrl: true,
              fileName: true,
              fileSize: true,
            },
          },
          replies: {
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: { id: true, name: true, avatarUrl: true } },
              attachments: {
                select: {
                  id: true,
                  storageUrl: true,
                  fileName: true,
                  fileSize: true,
                },
              },
            },
          },
        },
      },
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true } } },
      },
      intake: {
        include: {
          formConfig: { select: { name: true, id: true, allowCustomerReplies: true } },
        },
      },
      pullRequests: { include: { pr: true } },
      commits: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!ticket || ticket.deletedAt) notFound();

  // Drafts: only the creator or an admin may open them (managers/peers cannot).
  if (ticket.isDraft) {
    const isCreator = ticket.creatorId === profile.id;
    if (!isCreator && profile.role !== "admin") {
      return (
        <TicketAccessDenied
          reason="no_team_access"
          ticketRef={`${ticket.subDepartment.prefix}-${ticket.ticketNumber}`}
          deptName={ticket.subDepartment.department?.name ?? null}
          subDepartmentName={ticket.subDepartment.name}
        />
      );
    }
  }

  // ── Access control for shared ticket links ────────────────────────────────
  // Do NOT apply the active-workspace dept filter here — the user may have
  // clicked a link from a different department context. Instead, check their
  // actual permissions and surface a descriptive error when denied.
  const ticketDeptId = ticket.subDepartment.departmentId;
  const ticketDeptName = ticket.subDepartment.department?.name ?? null;
  const ticketSubDepartmentName = ticket.subDepartment.name;
  const humanTicketRef = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`;

  if (profile.role !== "admin" && !ticket.isDraft) {
    const managedIds: string[] = (profile as any).managedDepartmentIds ?? [];
    // Only FULL cross-department access (or managing the dept) grants blanket
    // visibility of every ticket in the department. Limited/project-scoped
    // grants must instead prove project membership via canCrossAccessGuestViewTicket.
    const fullAccessIds: string[] = (profile as any).fullAccessGrantedDeptIds ?? [];
    const subDepartmentIds: string[] =
      (profile as any).subDepartmentIds ?? (profile.subDepartmentId ? [profile.subDepartmentId] : []);

    // View access is granted by ANY legitimate relationship to the ticket —
    // never just the caller's currently-active department. This is what a
    // notification link relies on: a mentioned/assigned/co-assigned user, a
    // team member, a dept manager, or a cross-access guest can all open it.
    const onSubDepartment = subDepartmentIds.includes(ticket.subDepartmentId);
    const isAssignee =
      ticket.assigneeId === profile.id ||
      ticket.assignees.some((a) => a.user.id === profile.id);
    const isCreator = ticket.creatorId === profile.id;
    const managesDept =
      !!ticketDeptId &&
      (managedIds.includes(ticketDeptId) || fullAccessIds.includes(ticketDeptId));
    const canViewViaCrossAccess = await canCrossAccessGuestViewTicket(profile, {
      projectId: ticket.projectId,
      subDepartmentId: ticket.subDepartmentId,
      subDepartment: ticket.subDepartment,
      projectDeptId: ticket.project?.departmentId ?? null,
    });

    // In a cross-access-only (guest) workspace, visibility is intentionally
    // limited to the projects the user is assigned to. Native team membership
    // or dept management in *other* departments must not unlock a ticket that
    // belongs to a project they aren't a member of here — only assignees,
    // creators, and project members may open it.
    const deptScope = await getProfileDeptScope(profile);
    const hasAccess = deptScope?.isCrossAccessOnly
      ? isAssignee || isCreator || canViewViaCrossAccess
      : onSubDepartment || isAssignee || isCreator || managesDept || canViewViaCrossAccess;

    if (!hasAccess) {
      // A limited (non-full) cross-access grant that just lacks project
      // membership gets a project-focused message, mirroring the project page.
      const hasLimitedGrant = isLimitedCrossAccessToDept(
        profile,
        ticket.project?.departmentId ?? ticketDeptId,
      );
      const reason = hasLimitedGrant
        ? "not_project_member"
        : profile.role === "manager"
          ? "no_dept_access"
          : ticketDeptId
            ? "cross_access_needed"
            : "no_team_access";
      return (
        <TicketAccessDenied
          reason={reason}
          ticketRef={humanTicketRef}
          deptName={ticketDeptName}
          subDepartmentName={ticketSubDepartmentName}
        />
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Follow the link into the ticket's department ─────────────────────────
  // The viewer has access (checked above) but may have arrived from a link
  // while scoped to a different department. Switch their active workspace to
  // this ticket's department so the sidebar, breadcrumbs and lists match where
  // the ticket actually lives — but only when they're allowed to work there.
  const currentActiveDeptId =
    (await cookies()).get("pen_active_dept")?.value || null;

  // The department the task is "from": its project's department when it belongs
  // to one (projects are assigned to a department), otherwise its team's
  // department.
  const taskOriginDeptId = ticket.project?.departmentId ?? ticketDeptId;

  let shouldSwitchDept = false;
  if (taskOriginDeptId && taskOriginDeptId !== currentActiveDeptId) {
    if (profile.role === "admin") {
      // Don't yank an admin out of the global (no-dept) view; only re-point
      // an admin who is already scoped to a specific department.
      shouldSwitchDept = currentActiveDeptId !== null;
    } else {
      const membershipDeptIds: string[] = (
        (profile as any).memberships ?? []
      )
        .map((m: any) => m?.subDepartment?.department?.id)
        .filter((v: unknown): v is string => typeof v === "string");
      const switchable = new Set<string>([
        ...((profile as any).managedDepartmentIds ?? []),
        ...((profile as any).grantedAccessDeptIds ?? []),
        ...((profile as any).directMemberDeptIds ?? []),
        ...membershipDeptIds,
      ]);
      shouldSwitchDept = switchable.has(taskOriginDeptId);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const [subDepartmentMembers, subDepartmentStatuses, ticketTimeEntries, mentionableUsers, ticketMessages, ticketEditContext, github] =
    await Promise.all([
      getAssignableUsersForTicketDepartment(ticketDeptId, [
        ...(ticket.assignee
          ? [
              {
                id: ticket.assignee.id,
                name: ticket.assignee.name,
                avatarUrl: ticket.assignee.avatarUrl ?? null,
              },
            ]
          : []),
        ...ticket.assignees.map((a) => ({
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl ?? null,
        })),
      ]),
      getCachedSubDepartmentStatuses(ticket.subDepartmentId),
      prisma.timeEntry.findMany({
        where: { ticketId: ticket.id },
        include: {
          profile: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { startedAt: "asc" },
      }),
      getCachedMentionableUsers(ticketDeptId, ticket.subDepartmentId),
      prisma.ticketMessage.findMany({
        where: { ticketId: ticket.id },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
          attachments: {
            select: { id: true, storageUrl: true, fileName: true, fileSize: true },
          },
          notes: {
            where: { deletedAt: null },
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
          },
        },
      }),
      buildTicketEditContext(profile, ticket),
      // GitHub CI-check fetches hit the network — run them alongside the DB
      // queries so their latency overlaps instead of stacking on top.
      buildGitHubDevData(ticket),
    ]);

  // A sub-ticket counts as complete when its status is one flagged `isComplete`
  // on its own team (sub-tickets may live on a different team than the parent).
  const subSubDepartmentIds = [...new Set(ticket.subTickets.map((st) => st.subDepartmentId))];
  const completeStatusRows = subSubDepartmentIds.length
    ? await prisma.subDepartmentStatus.findMany({
        where: { subDepartmentId: { in: subSubDepartmentIds }, isComplete: true },
        select: { subDepartmentId: true, label: true },
      })
    : [];
  const completeSubStatuses = new Set(
    completeStatusRows.map((r) => `${r.subDepartmentId}::${r.label}`),
  );

  // Group time entries by user (completed secs only) — DEVELOPMENT vs QA
  const timeByUser = new Map<
    string,
    {
      userId: string;
      userName: string;
      avatarUrl: string | null;
      totalSecs: number;
      isRunning: boolean;
      runningStartedAt: string | null;
      sessions: {
        id: string;
        startedAt: string;
        endedAt: string | null;
        durationSecs: number | null;
      }[];
    }
  >();
  for (const entry of ticketTimeEntries) {
    const target = timeByUser;
    const existing = target.get(entry.profileId) ?? {
      userId: entry.profileId,
      userName: entry.profile.name,
      avatarUrl: entry.profile.avatarUrl ?? null,
      totalSecs: 0,
      isRunning: false,
      runningStartedAt: null,
      sessions: [],
    };
    if (entry.endedAt) {
      existing.totalSecs += entry.durationSecs ?? 0;
    } else {
      existing.isRunning = true;
      existing.runningStartedAt = entry.startedAt.toISOString();
    }
    // newest first
    existing.sessions.unshift({
      id: entry.id,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt ? entry.endedAt.toISOString() : null,
      durationSecs: entry.durationSecs ?? null,
    });
    target.set(entry.profileId, existing);
  }

  // Roll up time logged on this ticket's sub-tickets, shown on the parent.
  const subTicketIds = ticket.subTickets.map((s) => s.id);
  const subTicketEntries = subTicketIds.length
    ? await prisma.timeEntry.findMany({
        where: { ticketId: { in: subTicketIds }, endedAt: { not: null } },
        include: { profile: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { startedAt: "desc" },
      })
    : [];
  const subInfo = new Map(
    ticket.subTickets.map((s) => [
      s.id,
      { humanId: `${s.subDepartment.prefix}-${s.ticketNumber}`, title: s.title },
    ]),
  );
  const subPerTicketSecs = new Map<string, number>();
  const subTicketSessions = subTicketEntries.map((e) => ({
    id: e.id,
    subTicketDbId: e.ticketId!,
    subTicketHumanId: subInfo.get(e.ticketId!)?.humanId ?? "",
    subTicketTitle: subInfo.get(e.ticketId!)?.title ?? "",
    userName: e.profile.name,
    avatarUrl: e.profile.avatarUrl ?? null,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
    durationSecs: e.durationSecs ?? 0,
  }));
  for (const e of subTicketEntries) {
    subPerTicketSecs.set(
      e.ticketId!,
      (subPerTicketSecs.get(e.ticketId!) ?? 0) + (e.durationSecs ?? 0),
    );
  }
  const subTicketTime = {
    totalSecs: subTicketSessions.reduce((sum, s) => sum + s.durationSecs, 0),
    perTicket: ticket.subTickets
      .map((s) => ({
        dbId: s.id,
        humanId: `${s.subDepartment.prefix}-${s.ticketNumber}`,
        title: s.title,
        totalSecs: subPerTicketSecs.get(s.id) ?? 0,
      }))
      .filter((t) => t.totalSecs > 0)
      .sort((a, b) => b.totalSecs - a.totalSecs),
    sessions: subTicketSessions,
  };

  const myActiveEntry = ticketTimeEntries.find(
    (e) => e.profileId === profile.id && !e.endedAt,
  );
  const isCurrentUserAssignee =
    ticket.assigneeId === profile.id ||
    ticket.assignees.some((a) => a.user.id === profile.id);

  const humanId = `${ticket.subDepartment.prefix}-${ticket.ticketNumber}`;
  const { openedDaysAgo, dueOverdue } = ticketTimes(
    ticket.createdAt,
    ticket.dueDate,
    ticket.status,
  );
  const canEdit = canEditTicket(profile, ticketEditContext);
  const canEditDescription = canEditTicketDescription(profile, ticketEditContext);
  const canEditDates = canEdit;
  const canChangeStatus = canEdit;
  const canDelete = canDeleteTicket(profile, { creatorId: ticket.creatorId });

  return (
    <>
      {shouldSwitchDept && taskOriginDeptId && <ActiveDeptSync deptId={taskOriginDeptId} />}
      <BreadcrumbRegistrar
        crumbs={[
          { label: "My Tasks", href: "/tasks" },
          { label: humanId, href: `/tasks/${ticket.id}` },
        ]}
      />
      <TicketDetailPage
        dbId={ticket.id}
        ticketId={humanId}
        projectId={ticket.projectId ?? ""}
        subDepartmentId={ticket.subDepartmentId}
        projectName={ticket.project?.name ?? "Miscellaneous"}
        projectColor={ticket.project?.color ?? "#0a76b9"}
        projectKind={ticket.project?.kind ?? "standard"}
        projectModuleSystemEnabled={ticket.project?.moduleSystemEnabled ?? false}
        moduleId={ticket.moduleId ?? null}
        moduleName={ticket.module?.name ?? null}
        sprintId={ticket.sprintId ?? null}
        sprintName={ticket.sprint?.name ?? null}
        title={ticket.title}
        description={ticket.description}
        status={ticket.status}
        priority={PRIORITY_TO_UI[ticket.priority] ?? "medium"}
        labels={ticket.labels}
        openedBy={ticket.creator.name.split(" ")[0]}
        openedDaysAgo={openedDaysAgo}
        createdAtIso={ticket.createdAt.toISOString()}
        creatorName={ticket.creator.name}
        creatorAvatarUrl={ticket.creator.avatarUrl ?? null}
        assigneeId={ticket.assignee?.id ?? null}
        assigneeName={ticket.assignee?.name ?? null}
        assigneeAvatarUrl={ticket.assignee?.avatarUrl ?? null}
        coAssignees={ticket.assignees.map((a) => ({
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl ?? null,
        }))}
        startDateIso={ticket.startDate ? serializeTicketDateIso(ticket.startDate, "start") : null}
        dueDateIso={ticket.dueDate ? serializeTicketDateIso(ticket.dueDate, "due") : null}
        dueDate={
          ticket.dueDate
            ? ticket.dueDate.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })
            : null
        }
        closedAtIso={ticket.closedAt ? ticket.closedAt.toISOString() : null}
        dueOverdue={dueOverdue}
        canEditDates={canEditDates}
        canChangeStatus={canChangeStatus}
        canDelete={canDelete}
        canEditTicket={canEdit}
        canEditDescription={canEditDescription}
        isDraft={ticket.isDraft}
        parentTicket={
          ticket.parent
            ? {
                dbId: ticket.parent.id,
                humanId: `${ticket.parent.subDepartment.prefix}-${ticket.parent.ticketNumber}`,
                title: ticket.parent.title,
              }
            : null
        }
        storyPoints={ticket.storyPoints ?? null}
        estimatedTime={ticket.estimatedTime ?? null}
        personalEstimates={ticket.estimates.map((e) => ({
          userId: e.userId,
          estimatedMinutes: e.estimatedMinutes ?? null,
          targetDateIso: e.targetDate ? serializeTicketDateIso(e.targetDate, "due") : null,
        }))}
        timeEntries={[...timeByUser.values()]}
        subTicketTime={subTicketTime}
        myActiveTimerId={myActiveEntry?.id ?? null}
        myActiveTimerStartedAt={myActiveEntry?.startedAt.toISOString() ?? null}
        isCurrentUserAssignee={isCurrentUserAssignee}
        assetLinks={(ticket.assetLinks as { label: string; url: string }[] | null) ?? []}
        github={github}
        templateData={(ticket.templateData as Record<string, any> | null) ?? null}
        subDepartmentMembers={subDepartmentMembers}
        mentionableUsers={mentionableUsers}
        subDepartmentStatuses={subDepartmentStatuses}
        messages={ticketMessages.map((m) => ({
          id: m.id,
          direction: m.direction as "inbound" | "outbound",
          status: m.status as "trusted" | "quarantined" | "system",
          body: m.bodyHtml,
          fromName: m.fromName,
          fromEmail: m.fromEmail,
          authorId: m.author?.id ?? null,
          authorName: m.author?.name ?? null,
          authorAvatarUrl: m.author?.avatarUrl ?? null,
          createdAt: m.createdAt.toISOString(),
          attachments: m.attachments.map((a) => ({
            id: a.id,
            storageUrl: a.storageUrl,
            fileName: a.fileName,
            fileSize: a.fileSize,
          })),
          notes: m.notes.map((n) => ({
            id: n.id,
            body: n.body,
            authorId: n.author.id,
            authorName: n.author.name,
            authorAvatarUrl: n.author.avatarUrl ?? null,
            createdAt: n.createdAt.toISOString(),
            editedAt: n.editedAt?.toISOString() ?? null,
          })),
        }))}
        customerReply={{
          enabled:
            RESEND_RECEIVING_ENABLED &&
            !!ticket.intake &&
            ticket.intake.formConfig.allowCustomerReplies,
          customerName: ticket.intake?.submitterName ?? null,
          customerEmail: ticket.intake?.submitterEmail ?? null,
        }}
        intake={
          ticket.intake
            ? (() => {
                const deptName = ticket.subDepartment.department?.name ?? "";
                const deptSlug = deptName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                return {
                submitterName: ticket.intake.submitterName,
                submitterEmail: ticket.intake.submitterEmail,
                submittedAt: ticket.intake.createdAt.toISOString(),
                formName: ticket.intake.formConfig.name,
                portalUrl: deptSlug ? `/support/${deptSlug}/${ticket.intake.formConfig.id}` : null,
                responses: (
                  ticket.intake.responses as Array<{
                    fieldId?: string;
                    label?: string;
                    type?: string;
                    value?: string;
                  }>
                )
                  .filter((r) => r.fieldId && r.label && r.value)
                  .map((r) => ({
                    fieldId: r.fieldId as string,
                    label: r.label as string,
                    type: r.type ?? "text",
                    value: r.value as string,
                  })),
                }
              })()
            : null
        }
        subTickets={ticket.subTickets.map((st) => ({
          dbId: st.id,
          humanId: `${st.subDepartment.prefix}-${st.ticketNumber}`,
          title: st.title,
          status: st.status,
          done: completeSubStatuses.has(`${st.subDepartmentId}::${st.status}`),
          priority: PRIORITY_TO_UI[st.priority] ?? "medium",
          assigneeName: st.assignee?.name ?? null,
          assigneeAvatarUrl: st.assignee?.avatarUrl ?? null,
          canDelete: canDeleteTicket(profile, { creatorId: st.creatorId }),
        }))}
        comments={ticket.comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
          editedAt: c.editedAt?.toISOString() ?? null,
          deletedAt: c.deletedAt?.toISOString() ?? null,
          authorId: c.author.id,
          authorName: c.author.name,
          authorAvatarUrl: c.author.avatarUrl,
          attachments: c.attachments.map((a) => ({
            id: a.id,
            storageUrl: a.storageUrl,
            fileName: a.fileName,
            fileSize: a.fileSize,
          })),
          replies: c.replies.map((r) => ({
            id: r.id,
            body: r.body,
            createdAt: r.createdAt.toISOString(),
            editedAt: r.editedAt?.toISOString() ?? null,
            deletedAt: r.deletedAt?.toISOString() ?? null,
            authorId: r.author.id,
            authorName: r.author.name,
            authorAvatarUrl: r.author.avatarUrl,
            attachments: r.attachments.map((a) => ({
              id: a.id,
              storageUrl: a.storageUrl,
              fileName: a.fileName,
              fileSize: a.fileSize,
            })),
            replies: [],
          })),
        }))}
        activity={ticket.activityLogs.map((a) => ({
          id: a.id,
          action: a.action,
          actorName: a.actor.name,
          createdAt: a.createdAt.toISOString(),
          metadata: (a.metadata ?? {}) as Record<string, unknown>,
        }))}
      />
    </>
  );
}
