// Pure aggregation for the manager Morning Briefing — no Prisma imports so it
// stays unit-testable.

import { isBlockedStatus } from "@/lib/format";

export const DONE_STATUSES = [
  "Live", "Done", "Completed", "Closed",
  // Review/PR stages — work is done, just awaiting merge/sign-off
  "Pull Request", "In Review", "Code Review", "Needs Review", "Review",
];

export const IN_REVIEW_STATUSES = ["Review", "In Review", "Code Review", "Needs Review", "Pull Request"];
export const NOT_STARTED_STATUSES = ["Not Started", "To Do"];

export type OpenTicketRow = {
  id: string; humanId: string; title: string; status: string; priority: string;
  dueDate: string | null; updatedAt: string;
  assigneeId: string | null;
  projectId: string | null; projectName: string | null; projectColor: string | null;
};

export type MemberRow = { id: string; name: string; avatarUrl: string | null };

export type MemberWorkload = {
  id: string; name: string; avatarUrl: string | null;
  open: number; overdue: number; inReview: number;
  current: { id: string; humanId: string; title: string } | null;
  lastActivityAt: string | null;
  idle: boolean;
};

export type ProjectTicketRow = {
  projectId: string | null; projectName: string | null; projectColor: string | null;
  status: string; dueDate: string | null;
};

export type ProjectHealth = {
  projectId: string | null; name: string; color: string;
  total: number; done: number; overdue: number; active: number;
};

function isOverdue(dueDate: string | null, status: string, startOfToday: Date) {
  return (
    !!dueDate &&
    new Date(dueDate) < startOfToday &&
    !DONE_STATUSES.includes(status) &&
    !isBlockedStatus(status)
  );
}

function isActive(status: string) {
  return !DONE_STATUSES.includes(status) && !NOT_STARTED_STATUSES.includes(status);
}

export function buildMemberWorkloads(
  members: MemberRow[],
  openTickets: OpenTicketRow[],
  lastActivityByActor: Record<string, string>,
  startOfToday: Date,
): MemberWorkload[] {
  const byMember = new Map<string, OpenTicketRow[]>();
  for (const t of openTickets) {
    if (!t.assigneeId) continue;
    const list = byMember.get(t.assigneeId) ?? [];
    list.push(t);
    byMember.set(t.assigneeId, list);
  }

  const out = members.map((m): MemberWorkload => {
    const tickets = byMember.get(m.id) ?? [];
    const inReview = tickets.filter((t) => IN_REVIEW_STATUSES.includes(t.status));
    const openNotReview = tickets.filter((t) => !IN_REVIEW_STATUSES.includes(t.status));
    const overdue = openNotReview.filter((t) => isOverdue(t.dueDate, t.status, startOfToday));
    const inProgress = openNotReview
      .filter((t) => isActive(t.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const current = inProgress[0]
      ? { id: inProgress[0].id, humanId: inProgress[0].humanId, title: inProgress[0].title }
      : null;
    return {
      id: m.id, name: m.name, avatarUrl: m.avatarUrl,
      open: openNotReview.length,
      overdue: overdue.length,
      inReview: inReview.length,
      current,
      lastActivityAt: lastActivityByActor[m.id] ?? null,
      idle: !current,
    };
  });

  return out.sort((a, b) =>
    (b.overdue - a.overdue) || (b.open - a.open) || (Number(a.idle) - Number(b.idle)) || a.name.localeCompare(b.name),
  );
}

export function buildProjectHealth(rows: ProjectTicketRow[], startOfToday: Date): ProjectHealth[] {
  const byProject = new Map<string, ProjectHealth>();
  for (const r of rows) {
    const key = r.projectId ?? "__none__";
    const entry = byProject.get(key) ?? {
      projectId: r.projectId,
      name: r.projectName ?? "No project",
      color: r.projectColor ?? "#64748b",
      total: 0, done: 0, overdue: 0, active: 0,
    };
    entry.total += 1;
    if (DONE_STATUSES.includes(r.status)) entry.done += 1;
    if (isOverdue(r.dueDate, r.status, startOfToday)) entry.overdue += 1;
    if (isActive(r.status)) entry.active += 1;
    byProject.set(key, entry);
  }
  return [...byProject.values()].sort((a, b) => b.total - a.total);
}

export type Distribution = {
  done: number; review: number; overdue: number; active: number; todo: number; total: number;
};

// Each ticket lands in exactly one bucket: done > review > overdue > active > todo.
export function bucketDistribution(rows: ProjectTicketRow[], startOfToday: Date): Distribution {
  const d: Distribution = { done: 0, review: 0, overdue: 0, active: 0, todo: 0, total: rows.length };
  for (const r of rows) {
    if (IN_REVIEW_STATUSES.includes(r.status)) d.review += 1;
    else if (DONE_STATUSES.includes(r.status)) d.done += 1;
    else if (isOverdue(r.dueDate, r.status, startOfToday)) d.overdue += 1;
    else if (isActive(r.status)) d.active += 1;
    else d.todo += 1;
  }
  return d;
}

export type TimeEntryRow = {
  ticketId: string | null; ticketHumanId: string | null; ticketTitle: string | null;
  startedAt: string; endedAt: string | null; durationSecs: number | null; note: string | null;
};

export type TimeSummary = {
  todaySecs: number; weekSecs: number; running: boolean;
  byTicket: { ticketId: string | null; humanId: string | null; title: string | null; secs: number; notes: string[] }[];
};

// Running entries (endedAt null) count elapsed time up to `now`.
export function summarizeTime(entries: TimeEntryRow[], startOfToday: Date, now: Date): TimeSummary {
  let todaySecs = 0, weekSecs = 0, running = false;
  const byTicket = new Map<string, TimeSummary["byTicket"][number]>();

  for (const e of entries) {
    const secs = e.endedAt === null
      ? Math.max(0, Math.floor((now.getTime() - new Date(e.startedAt).getTime()) / 1000))
      : e.durationSecs ?? Math.max(0, Math.floor((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 1000));
    if (e.endedAt === null) running = true;
    weekSecs += secs;
    if (new Date(e.startedAt) >= startOfToday) todaySecs += secs;

    const key = e.ticketId ?? "__none__";
    const g = byTicket.get(key) ?? { ticketId: e.ticketId, humanId: e.ticketHumanId, title: e.ticketTitle, secs: 0, notes: [] };
    g.secs += secs;
    if (e.note) g.notes.push(e.note);
    byTicket.set(key, g);
  }

  return {
    todaySecs, weekSecs, running,
    byTicket: [...byTicket.values()].sort((a, b) => b.secs - a.secs),
  };
}

export function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export type DigestParts = {
  overdue: number; topOverdueProject: string | null; topOverdueCount: number;
  review: number; unassigned: number; movedToday: number; requests: number;
};

export function buildDigest(p: DigestParts): string {
  const segments: string[] = [];
  if (p.overdue > 0) {
    const top = p.topOverdueProject && p.topOverdueCount > 0 ? ` (${p.topOverdueCount} in ${p.topOverdueProject})` : "";
    segments.push(`${p.overdue} overdue${top}`);
  }
  if (p.review > 0) segments.push(`${p.review} waiting for review`);
  if (p.unassigned > 0) segments.push(`${p.unassigned} unassigned`);
  if (p.movedToday > 0) segments.push(`${p.movedToday} tickets moved today`);
  if (p.requests > 0) segments.push(`${p.requests} pending requests`);
  if (segments.length === 0) return "All clear — nothing needs your attention right now.";
  return segments.join(" · ");
}
