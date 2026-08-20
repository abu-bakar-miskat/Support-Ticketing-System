import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_BOARD_COLUMNS,
  STATUS_TYPES,
  isStatusType,
  isResolvedType,
  firstColumnOfType,
  defaultColumnLabelForStatus,
  seedDepartmentBoard,
  type StatusType,
} from "./board-columns";

describe("DEFAULT_BOARD_COLUMNS", () => {
  it("seeds exactly the five status-typed defaults in order", () => {
    expect(DEFAULT_BOARD_COLUMNS.map((c) => [c.label, c.statusType, c.order])).toEqual([
      ["OPEN", "OPEN", 0],
      ["IN PROGRESS", "OPEN", 1],
      ["PAUSED", "PAUSED", 2],
      ["ESCALATED", "ESCALATED", 3],
      ["RESOLVED", "RESOLVED", 4],
    ]);
  });

  it("covers every status type at least once", () => {
    const types = new Set(DEFAULT_BOARD_COLUMNS.map((c) => c.statusType));
    for (const t of STATUS_TYPES) expect(types.has(t)).toBe(true);
  });
});

describe("isStatusType", () => {
  it("accepts the four types and rejects anything else", () => {
    for (const t of STATUS_TYPES) expect(isStatusType(t)).toBe(true);
    expect(isStatusType("DONE")).toBe(false);
    expect(isStatusType("open")).toBe(false);
    expect(isStatusType(null)).toBe(false);
  });
});

describe("isResolvedType", () => {
  it("is true only for RESOLVED", () => {
    expect(isResolvedType("RESOLVED")).toBe(true);
    expect(isResolvedType("OPEN")).toBe(false);
    expect(isResolvedType("PAUSED")).toBe(false);
    expect(isResolvedType("ESCALATED")).toBe(false);
  });
});

describe("firstColumnOfType", () => {
  const cols = [
    { id: "c", statusType: "OPEN" as StatusType, order: 2 },
    { id: "a", statusType: "OPEN" as StatusType, order: 0 },
    { id: "b", statusType: "RESOLVED" as StatusType, order: 4 },
  ];
  it("returns the lowest-order column of the type", () => {
    expect(firstColumnOfType(cols, "OPEN")?.id).toBe("a");
    expect(firstColumnOfType(cols, "RESOLVED")?.id).toBe("b");
  });
  it("returns null when the board has no column of that type", () => {
    expect(firstColumnOfType(cols, "ESCALATED")).toBeNull();
  });
});

describe("defaultColumnLabelForStatus — collapse-to-5 mapping", () => {
  it("maps any complete status to Done regardless of label", () => {
    expect(defaultColumnLabelForStatus("In Progress", true)).toBe("Done");
    expect(defaultColumnLabelForStatus("whatever", true)).toBe("Done");
  });
  it("maps resolved-style labels to Done", () => {
    for (const l of ["Live", "Closed", "Resolved", "Completed", "Merged"]) {
      expect(defaultColumnLabelForStatus(l, false)).toBe("Done");
    }
  });
  it("maps escalation labels to Escalated", () => {
    expect(defaultColumnLabelForStatus("Escalated", false)).toBe("Escalated");
  });
  it("maps hold/waiting/blocked labels to On Hold (not Escalated)", () => {
    for (const l of ["On Hold", "Paused", "Waiting", "Blocked", "Stalled"]) {
      expect(defaultColumnLabelForStatus(l, false)).toBe("On Hold");
    }
  });
  it("maps backlog-style labels to To Do", () => {
    for (const l of ["To Do", "Not Started", "Backlog", "New", "Triage"]) {
      expect(defaultColumnLabelForStatus(l, false)).toBe("To Do");
    }
  });
  it("falls back to In Progress for unrecognized open labels", () => {
    expect(defaultColumnLabelForStatus("Pull Request", false)).toBe("In Progress");
    expect(defaultColumnLabelForStatus("Code Review", false)).toBe("In Progress");
    expect(defaultColumnLabelForStatus("", false)).toBe("In Progress");
  });
});

describe("seedDepartmentBoard", () => {
  it("creates the five defaults with tenant stamp when the board is empty", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 5 });
    const tx = {
      boardColumn: { findFirst: vi.fn().mockResolvedValue(null), createMany },
    };
    await seedDepartmentBoard(tx, { departmentId: "d1", tenantId: "t1" });
    expect(createMany).toHaveBeenCalledTimes(1);
    const data = createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(5);
    expect(data.every((r: { tenantId: string; departmentId: string }) => r.tenantId === "t1" && r.departmentId === "d1")).toBe(true);
    expect(data.map((r: { statusType: string }) => r.statusType)).toEqual([
      "OPEN", "OPEN", "PAUSED", "ESCALATED", "RESOLVED",
    ]);
  });

  it("is idempotent — no-ops when the board already has a column", async () => {
    const createMany = vi.fn();
    const tx = {
      boardColumn: { findFirst: vi.fn().mockResolvedValue({ id: "existing" }), createMany },
    };
    await seedDepartmentBoard(tx, { departmentId: "d1", tenantId: "t1" });
    expect(createMany).not.toHaveBeenCalled();
  });
});
