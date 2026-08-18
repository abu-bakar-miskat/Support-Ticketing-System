import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/profile";
import { prisma } from "@/lib/db";
import {
  getProfileDeptScope,
  ticketInDeptWhere,
  effectiveTicketDept,
} from "@/lib/dept-scope";
import { PeopleReportsGridSkeleton } from "@/components/skeletons/page-skeletons";
import {
  PeopleReportsHeader,
  PeopleReportsGrid,
  type PersonReport,
} from "@/components/manager/people-reports";
import {
  IN_REVIEW_STATUSES,
  summarizeTime,
  type TimeEntryRow,
} from "@/components/manager/aggregate";
import {
  resolvePeopleRange,
  type ResolvedPeopleRange,
} from "@/components/manager/people-range";

export const metadata = { title: "Team Reports — Ticketing System" };

/** Fallback when a team has no isComplete statuses configured */
const FALLBACK_COMPLETE = ["Live", "Done", "Completed", "Closed"];

async function PeopleReportsData({ range }: { range: ResolvedPeopleRange }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const deptScope = await getProfileDeptScope(profile);

  if (profile.role === "manager" && deptScope?.activeDeptId) {
    const managedIds: string[] = profile.managedDepartmentIds ?? [];
    if (!managedIds.includes(deptScope.activeDeptId)) redirect("/");
  }

  const subDepartmentIds = deptScope?.subDepartmentIds ?? [];
  const activeDeptId = deptScope?.activeDeptId ?? null;
  // Tickets that BELONG to this department (by their project's department, not
  // just the ticket's team) — captures cross-dept-access work created on a
  // member's own team but inside another department's project.
  const inDeptWhere = activeDeptId ? ticketInDeptWhere(activeDeptId) : null;
  const belongsToActive = (t: Parameters<typeof effectiveTicketDept>[0]) =>
    effectiveTicketDept(t)?.id === activeDeptId;

  // Midnight in GMT+6 (Asia/Dhaka), matching the manager dashboard's "today"
  const nowDhaka = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  const startOfToday = new Date(nowDhaka.getFullYear(), nowDhaka.getMonth(), nowDhaka.getDate());
  const now = new Date();
  // Reporting window from the date filter (defaults to the last 7 days).
  const { start: rangeStart, end: rangeEnd } = range;

  const members = subDepartmentIds.length > 0
    ? await prisma.profile.findMany({
        where: { memberships: { some: { subDepartmentId: { in: subDepartmentIds }, isActive: true } } },
        select: { id: true, name: true, avatarUrl: true },
        orderBy: { name: "asc" },
      })
    : [];
  const memberIds = members.map((m) => m.id);
  const memberIdSet = new Set(memberIds);

  // Cross-department contributors: people who created / were assigned / QA'd /
  // logged time on THIS department's teams during the window but aren't members
  // (they work here via a cross-dept access grant). They should still appear in
  // this department's report, marked as external.
  const [extCreators, extAssignees, extQa, extTimers] =
    inDeptWhere
      ? await Promise.all([
          prisma.ticket.findMany({
            where: { deletedAt: null, ...inDeptWhere, createdAt: { gte: rangeStart, lte: rangeEnd } },
            select: { creatorId: true },
            distinct: ["creatorId"],
          }),
          prisma.ticket.findMany({
            where: { deletedAt: null, ...inDeptWhere, assigneeId: { not: null } },
            select: { assigneeId: true },
            distinct: ["assigneeId"],
          }),
          prisma.ticketQaAssignee.findMany({
            where: { ticket: { deletedAt: null, ...inDeptWhere } },
            select: { userId: true },
            distinct: ["userId"],
          }),
          prisma.timeEntry.findMany({
            where: { startedAt: { gte: rangeStart, lte: rangeEnd }, ticket: inDeptWhere },
            select: { profileId: true },
            distinct: ["profileId"],
          }),
        ])
      : [[], [], [], []];

  const externalIdSet = new Set<string>();
  for (const r of extCreators) if (r.creatorId && !memberIdSet.has(r.creatorId)) externalIdSet.add(r.creatorId);
  for (const r of extAssignees) if (r.assigneeId && !memberIdSet.has(r.assigneeId)) externalIdSet.add(r.assigneeId);
  for (const r of extQa) if (r.userId && !memberIdSet.has(r.userId)) externalIdSet.add(r.userId);
  for (const r of extTimers) if (r.profileId && !memberIdSet.has(r.profileId)) externalIdSet.add(r.profileId);
  const externalIds = [...externalIdSet];

  const externalProfiles = externalIds.length > 0
    ? await prisma.profile.findMany({
        where: { id: { in: externalIds } },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          subDepartment: { select: { department: { select: { name: true } } } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  const rosterIds = [...memberIds, ...externalIds];

  const ticketSelect = {
    id: true, ticketNumber: true, title: true, priority: true, status: true,
    dueDate: true, updatedAt: true, assigneeId: true, subDepartmentId: true,
    subDepartment: { select: { id: true, prefix: true, department: { select: { id: true, name: true } } } },
    project: {
      select: {
        name: true,
        color: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        subDepartment: { select: { department: { select: { id: true, name: true } } } },
      },
    },
  } as const;

  const qaTicketSelect = {
    ...ticketSelect,
    qaAssignees: {
      where: { userId: { in: rosterIds } },
      select: { userId: true },
    },
  } as const;

  const [inDeptTickets, inDeptCreatedTickets, crossDeptTickets, crossDeptCreatedTickets, qaTickets, qaAssigneeRows, todayActivity, timeEntries, completeStatusRows] = await Promise.all([
    // All in-dept assignments (members + external contributors) — classify open / review / done
    inDeptWhere && rosterIds.length > 0
      ? prisma.ticket.findMany({
          where: {
            deletedAt: null,
            ...inDeptWhere,
            assigneeId: { in: rosterIds },
          },
          orderBy: { updatedAt: "desc" },
          select: ticketSelect,
        })
      : Promise.resolve([] as never[]),

    // In-dept tickets created here (members + external contributors) within the window
    inDeptWhere && rosterIds.length > 0
      ? prisma.ticket.findMany({
          where: {
            deletedAt: null,
            ...inDeptWhere,
            creatorId: { in: rosterIds },
            createdAt: { gte: rangeStart, lte: rangeEnd },
          },
          orderBy: { createdAt: "desc" },
          select: { ...ticketSelect, creatorId: true },
        })
      : Promise.resolve([] as never[]),

    // Members' cross-dept assignments (their work belonging to other departments)
    inDeptWhere && memberIds.length > 0
      ? prisma.ticket.findMany({
          where: {
            deletedAt: null,
            NOT: inDeptWhere,
            assigneeId: { in: memberIds },
          },
          orderBy: { updatedAt: "desc" },
          select: ticketSelect,
        })
      : Promise.resolve([] as never[]),

    // Members' cross-dept tickets created within the reporting window
    inDeptWhere && memberIds.length > 0
      ? prisma.ticket.findMany({
          where: {
            deletedAt: null,
            NOT: inDeptWhere,
            creatorId: { in: memberIds },
            createdAt: { gte: rangeStart, lte: rangeEnd },
          },
          orderBy: { createdAt: "desc" },
          select: { ...ticketSelect, creatorId: true },
        })
      : Promise.resolve([] as never[]),

    // QA assignments for the roster (any team — personal QA load; externals scoped in the map)
    rosterIds.length > 0
      ? prisma.ticket.findMany({
          where: {
            deletedAt: null,
            qaAssignees: { some: { userId: { in: rosterIds } } },
          },
          orderBy: { updatedAt: "desc" },
          select: qaTicketSelect,
        })
      : Promise.resolve([] as never[]),

    // Anyone in the roster who has ever been a QA assignee — gates QA stats UI
    rosterIds.length > 0
      ? prisma.ticketQaAssignee.findMany({
          where: { userId: { in: rosterIds } },
          select: { userId: true },
          distinct: ["userId"],
        })
      : Promise.resolve([] as { userId: string }[]),

    prisma.activityLog.findMany({
      where: {
        createdAt: { gte: rangeStart, lte: rangeEnd },
        actorId: { in: rosterIds },
        ticket: { deletedAt: null, ...(inDeptWhere ?? {}) },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, action: true, createdAt: true, metadata: true, actorId: true,
        ticket: { select: { id: true, ticketNumber: true, title: true, subDepartment: { select: { prefix: true } } } },
      },
    }),

    prisma.timeEntry.findMany({
      where: { profileId: { in: rosterIds }, startedAt: { gte: rangeStart, lte: rangeEnd } },
      orderBy: { startedAt: "desc" },
      select: {
        profileId: true, startedAt: true, endedAt: true, durationSecs: true, note: true,
        kind: true,
        ticket: {
          select: {
            id: true, ticketNumber: true, title: true, subDepartmentId: true,
            subDepartment: { select: { prefix: true, department: { select: { id: true, name: true } } } },
            project: {
              select: {
                departmentId: true,
                department: { select: { id: true, name: true } },
                subDepartment: { select: { department: { select: { id: true, name: true } } } },
              },
            },
          },
        },
      },
    }),

    // Complete statuses for every team we might classify tickets against
    prisma.subDepartmentStatus.findMany({
      where: { isComplete: true },
      select: { subDepartmentId: true, label: true },
    }),
  ]);

  const qaAssigneeEver = new Set(qaAssigneeRows.map((r) => r.userId));

  const doneBySubDepartment = new Map<string, Set<string>>();
  for (const row of completeStatusRows) {
    const set = doneBySubDepartment.get(row.subDepartmentId) ?? new Set<string>();
    set.add(row.label);
    doneBySubDepartment.set(row.subDepartmentId, set);
  }

  const isDone = (t: { subDepartmentId: string; status: string }) => {
    const set = doneBySubDepartment.get(t.subDepartmentId);
    if (set && set.size > 0) return set.has(t.status);
    return FALLBACK_COMPLETE.includes(t.status);
  };

  /** Incomplete review/PR stages — only when that status is NOT marked complete for the team */
  const isIncompleteReview = (t: { subDepartmentId: string; status: string }) =>
    !isDone(t) && IN_REVIEW_STATUSES.includes(t.status);

  const humanId = (t: { ticketNumber: number; subDepartment: { prefix: string } }) =>
    `${t.subDepartment.prefix}-${t.ticketNumber}`;

  type DeptRef = { id: string; name: string };
  const toTicket = (
    t: {
      id: string;
      ticketNumber: number;
      title: string;
      priority: string;
      status: string;
      dueDate: Date | null;
      updatedAt: Date;
      subDepartmentId: string;
      project:
        | {
            name: string;
            color: string | null;
            department?: DeptRef | null;
            subDepartment?: { department?: DeptRef | null } | null;
          }
        | null;
      subDepartment: { prefix: string; department: DeptRef | null };
    },
    includeDepartment = false,
  ) => ({
    id: t.id,
    humanId: humanId(t),
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    project: t.project ? { name: t.project.name, color: t.project.color ?? "#0a76b9" } : null,
    ...(includeDepartment
      ? { departmentName: effectiveTicketDept(t)?.name ?? null }
      : {}),
  });

  const roster = [
    ...members.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      isExternal: false,
      homeDepartmentName: null as string | null,
    })),
    ...externalProfiles.map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      isExternal: true,
      homeDepartmentName: m.subDepartment?.department?.name ?? null,
    })),
  ];

  const reports: PersonReport[] = roster.map((m) => {
    const mine = inDeptTickets.filter((t) => t.assigneeId === m.id);
    const open = mine.filter((t) => !isDone(t) && !isIncompleteReview(t));
    const inReviewShipped = mine.filter((t) => isIncompleteReview(t));
    const doneShipped = mine.filter(
      (t) => isDone(t) && t.updatedAt >= rangeStart && t.updatedAt <= rangeEnd,
    );
    const overdue = open.filter((t) => t.dueDate && t.dueDate < startOfToday);

    const createdHere = inDeptCreatedTickets.filter((t) => t.creatorId === m.id);

    // Outward cross-dept work only applies to this department's own members.
    const crossMine = m.isExternal
      ? []
      : crossDeptTickets.filter((t) => t.assigneeId === m.id);
    const crossOpen = crossMine.filter((t) => !isDone(t));
    const crossShipped = crossMine.filter(
      (t) => isDone(t) && t.updatedAt >= rangeStart && t.updatedAt <= rangeEnd,
    );
    const crossCreated = m.isExternal
      ? []
      : crossDeptCreatedTickets.filter((t) => t.creatorId === m.id);

    let crossDeptDevSecs = 0;
    let crossDeptQaSecs = 0;
    if (!m.isExternal) {
      for (const e of timeEntries) {
        if (e.profileId !== m.id || !e.ticket) continue;
        if (belongsToActive(e.ticket)) continue; // only time on OTHER departments' work
        const secs = e.durationSecs ?? 0;
        if (e.kind === "QA") crossDeptQaSecs += secs;
        else crossDeptDevSecs += secs;
      }
    }

    // For external contributors, restrict QA + time to work belonging to this department.
    const myQa = qaTickets.filter(
      (t) => t.qaAssignees.some((a) => a.userId === m.id) && (!m.isExternal || belongsToActive(t)),
    );
    const qaOpen = myQa.filter((t) => !isDone(t));
    const qaDone = myQa.filter(
      (t) => isDone(t) && t.updatedAt >= rangeStart && t.updatedAt <= rangeEnd,
    );

    const mapEntry = (e: (typeof timeEntries)[number]): TimeEntryRow => ({
      ticketId: e.ticket?.id ?? null,
      ticketHumanId: e.ticket ? humanId(e.ticket) : null,
      ticketTitle: e.ticket?.title ?? null,
      startedAt: e.startedAt.toISOString(),
      endedAt: e.endedAt?.toISOString() ?? null,
      durationSecs: e.durationSecs,
      note: e.note,
    });
    const myEntries = timeEntries.filter(
      (e) => e.profileId === m.id && (!m.isExternal || (e.ticket ? belongsToActive(e.ticket) : false)),
    );
    const myDevEntries = myEntries.filter((e) => e.kind !== "QA").map(mapEntry);
    const myQaEntries = myEntries.filter((e) => e.kind === "QA").map(mapEntry);
    const time = summarizeTime(myDevEntries, startOfToday, now);
    const qaTime = summarizeTime(myQaEntries, startOfToday, now);

    const activity = todayActivity
      .filter((a) => a.actorId === m.id)
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        action: a.action as string,
        createdAt: a.createdAt.toISOString(),
        statusTo:
          a.action === "STATUS_CHANGED" && a.metadata && typeof a.metadata === "object"
            ? ((a.metadata as Record<string, unknown>).to as string | undefined) ?? null
            : null,
        ticket: { id: a.ticket.id, humanId: humanId(a.ticket), title: a.ticket.title },
      }));

    const toQaTicket = (t: (typeof myQa)[number]) =>
      toTicket(t, !belongsToActive(t));

    return {
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      isExternal: m.isExternal,
      homeDepartmentName: m.homeDepartmentName,
      openTickets: open.map((t) => toTicket(t)),
      overdueCount: overdue.length,
      shippedReview: inReviewShipped.map((t) => toTicket(t)),
      shippedDone: doneShipped.map((t) => toTicket(t)),
      createdInDept: createdHere.map((t) => toTicket(t)),
      crossDeptOpen: crossOpen.map((t) => toTicket(t, true)),
      crossDeptShipped: crossShipped.map((t) => toTicket(t, true)),
      crossDeptCreated: crossCreated.map((t) => toTicket(t, true)),
      crossDeptDevSecs,
      crossDeptQaSecs,
      hasQaAssignment: qaAssigneeEver.has(m.id),
      qaOpen: qaOpen.map(toQaTicket),
      qaDone: qaDone.map(toQaTicket),
      time,
      qaTime,
      activity,
    };
  });

  reports.sort((a, b) =>
    (Number(a.isExternal) - Number(b.isExternal)) ||
    (b.overdueCount - a.overdueCount) ||
    (b.openTickets.length - a.openTickets.length) ||
    (b.time.weekSecs - a.time.weekSecs) ||
    a.name.localeCompare(b.name),
  );

  return (
    <PeopleReportsGrid
      reports={reports}
      noSubDepartments={subDepartmentIds.length === 0}
      rangeLabel={range.label}
    />
  );
}

export default async function ManagerPeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager" && profile.role !== "admin") redirect("/");

  const sp = await searchParams;
  const range = resolvePeopleRange(sp.range, sp.from, sp.to);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-4 py-6 sm:px-6 xl:px-8">
        <PeopleReportsHeader range={{ preset: range.preset, label: range.label }} />
        <Suspense key={`${range.from}:${range.to}`} fallback={<PeopleReportsGridSkeleton />}>
          <PeopleReportsData range={range} />
        </Suspense>
      </div>
    </div>
  );
}
