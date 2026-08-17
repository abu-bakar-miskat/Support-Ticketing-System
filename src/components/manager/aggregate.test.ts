import { describe, it, expect } from "vitest";
import {
  buildMemberWorkloads,
  buildProjectHealth,
  buildDigest,
  type OpenTicketRow,
  type MemberRow,
  type ProjectTicketRow,
} from "./aggregate";

const T0 = new Date("2026-07-22T00:00:00Z"); // startOfToday for tests

const members: MemberRow[] = [
  { id: "u1", name: "Miskat", avatarUrl: null },
  { id: "u2", name: "Nur", avatarUrl: null },
  { id: "u3", name: "Sadia", avatarUrl: null },
];

function ticket(over: Partial<OpenTicketRow>): OpenTicketRow {
  return {
    id: "t", humanId: "WEB-1", title: "x", status: "In Progress",
    priority: "Medium", dueDate: null, updatedAt: "2026-07-21T10:00:00Z",
    assigneeId: null, projectId: null, projectName: null, projectColor: null,
    ...over,
  };
}

describe("buildMemberWorkloads", () => {
  it("computes counts, current ticket, and sorts overloaded first / idle last", () => {
    const rows: OpenTicketRow[] = [
      ticket({ id: "a", humanId: "WEB-10", assigneeId: "u1", status: "In Progress", updatedAt: "2026-07-21T09:00:00Z" }),
      ticket({ id: "b", humanId: "WEB-11", assigneeId: "u1", status: "In Progress", updatedAt: "2026-07-21T12:00:00Z" }),
      ticket({ id: "c", humanId: "WEB-12", assigneeId: "u1", status: "To Do", dueDate: "2026-07-20T00:00:00Z" }), // overdue
      ticket({ id: "d", humanId: "WEB-13", assigneeId: "u2", status: "Pull Request" }), // in review, not open-active
    ];
    const out = buildMemberWorkloads(members, rows, { u2: "2026-07-22T05:00:00Z" }, T0);

    expect(out.map((m) => m.name)).toEqual(["Miskat", "Nur", "Sadia"]); // overdue first, then active, idle last
    const miskat = out[0];
    expect(miskat.open).toBe(3);
    expect(miskat.overdue).toBe(1);
    expect(miskat.inReview).toBe(0);
    expect(miskat.current?.humanId).toBe("WEB-11"); // most recently updated in-progress
    const nur = out[1];
    expect(nur.inReview).toBe(1);
    expect(nur.current).toBeNull(); // PR stage is not "working on now"
    expect(nur.lastActivityAt).toBe("2026-07-22T05:00:00Z");
    const sadia = out[2];
    expect(sadia.open).toBe(0);
    expect(sadia.idle).toBe(true);
  });

  it("does not mark done-status or null-dueDate tickets overdue", () => {
    const rows = [ticket({ assigneeId: "u1", status: "In Progress", dueDate: null })];
    const out = buildMemberWorkloads(members.slice(0, 1), rows, {}, T0);
    expect(out[0].overdue).toBe(0);
  });
});

describe("buildProjectHealth", () => {
  it("buckets per project with no-project fallback, sorted by total desc", () => {
    const rows: ProjectTicketRow[] = [
      { projectId: "p1", projectName: "EducateU", projectColor: "#111", status: "Done", dueDate: null },
      { projectId: "p1", projectName: "EducateU", projectColor: "#111", status: "In Progress", dueDate: "2026-07-20T00:00:00Z" },
      { projectId: "p1", projectName: "EducateU", projectColor: "#111", status: "To Do", dueDate: null },
      { projectId: null, projectName: null, projectColor: null, status: "In Progress", dueDate: null },
    ];
    const out = buildProjectHealth(rows, T0);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: "EducateU", total: 3, done: 1, overdue: 1, active: 1 });
    expect(out[1].name).toBe("No project");
  });
});

describe("buildDigest", () => {
  it("joins non-zero segments and omits zero ones", () => {
    expect(
      buildDigest({ overdue: 29, topOverdueProject: "EducateU", topOverdueCount: 18, review: 50, unassigned: 2, movedToday: 12, requests: 0 }),
    ).toBe("29 overdue (18 in EducateU) · 50 waiting for review · 2 unassigned · 12 tickets moved today");
    expect(
      buildDigest({ overdue: 0, topOverdueProject: null, topOverdueCount: 0, review: 0, unassigned: 0, movedToday: 0, requests: 0 }),
    ).toBe("All clear — nothing needs your attention right now.");
  });
});

describe("bucketDistribution", () => {
  it("buckets each ticket exactly once with priority done > review > overdue > active > todo", async () => {
    const { bucketDistribution } = await import("./aggregate");
    const rows: ProjectTicketRow[] = [
      { projectId: null, projectName: null, projectColor: null, status: "Done", dueDate: "2026-07-01T00:00:00Z" },
      { projectId: null, projectName: null, projectColor: null, status: "Pull Request", dueDate: "2026-07-01T00:00:00Z" },
      { projectId: null, projectName: null, projectColor: null, status: "In Progress", dueDate: "2026-07-01T00:00:00Z" },
      { projectId: null, projectName: null, projectColor: null, status: "In Progress", dueDate: null },
      { projectId: null, projectName: null, projectColor: null, status: "To Do", dueDate: null },
    ];
    expect(bucketDistribution(rows, T0)).toEqual({ done: 1, review: 1, overdue: 1, active: 1, todo: 1, total: 5 });
  });
});

describe("summarizeTime / formatDuration", () => {
  it("sums week and today, counts running timers up to now, groups by ticket", async () => {
    const { summarizeTime } = await import("./aggregate");
    const now = new Date("2026-07-22T10:00:00Z");
    const entries = [
      // yesterday, 2h on WEB-10
      { ticketId: "a", ticketHumanId: "WEB-10", ticketTitle: "Checkout", startedAt: "2026-07-21T08:00:00Z", endedAt: "2026-07-21T10:00:00Z", durationSecs: 7200, note: null },
      // today, 30m on WEB-10
      { ticketId: "a", ticketHumanId: "WEB-10", ticketTitle: "Checkout", startedAt: "2026-07-22T08:00:00Z", endedAt: "2026-07-22T08:30:00Z", durationSecs: 1800, note: "fix" },
      // running since 09:00 today → 1h so far
      { ticketId: null, ticketHumanId: null, ticketTitle: null, startedAt: "2026-07-22T09:00:00Z", endedAt: null, durationSecs: null, note: null },
    ];
    const s = summarizeTime(entries, new Date("2026-07-22T00:00:00Z"), now);
    expect(s.weekSecs).toBe(7200 + 1800 + 3600);
    expect(s.todaySecs).toBe(1800 + 3600);
    expect(s.running).toBe(true);
    expect(s.byTicket[0]).toMatchObject({ humanId: "WEB-10", secs: 9000 });
    expect(s.byTicket[1]).toMatchObject({ humanId: null, secs: 3600 });
  });

  it("formats durations as h/m", async () => {
    const { formatDuration } = await import("./aggregate");
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45 * 60)).toBe("45m");
    expect(formatDuration(3 * 3600 + 20 * 60)).toBe("3h 20m");
    expect(formatDuration(2 * 3600)).toBe("2h");
  });
});
