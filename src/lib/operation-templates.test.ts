import { describe, expect, it } from "vitest";
import { DEFAULT_SUB_DEPARTMENT_STATUSES } from "./board-columns";
import {
  OPERATION_TEMPLATES,
  isReplaceableStatusSet,
  operationTemplateBySlug,
  remapStatusLabels,
} from "./operation-templates";

describe("operation templates", () => {
  it("gives every operation its own board and lists that use those statuses", () => {
    const slugs = new Set<string>();
    for (const operation of OPERATION_TEMPLATES) {
      expect(slugs.has(operation.slug)).toBe(false);
      slugs.add(operation.slug);
      expect(operation.statuses.some((status) => status.isComplete)).toBe(true);
      expect(operation.statuses.some((status) => !status.isComplete)).toBe(true);
      const labels = new Set(operation.statuses.map((status) => status.label));
      for (const list of operation.lists) {
        expect(list.statuses.length).toBeGreaterThan(0);
        for (const status of list.statuses) expect(labels.has(status)).toBe(true);
      }
    }
    expect(operationTemplateBySlug("op-sales")?.name).toBe("Sales");
    expect(operationTemplateBySlug("timeline")).toBeNull();
  });

  it("can replace the default board or another operation board, and leaves a custom one", () => {
    expect(isReplaceableStatusSet(DEFAULT_SUB_DEPARTMENT_STATUSES.map((status) => status.label))).toBe(true);
    expect(isReplaceableStatusSet(OPERATION_TEMPLATES[0]!.statuses.map((status) => status.label))).toBe(true);
    expect(isReplaceableStatusSet(["Triage", "Build", "Ship"])).toBe(false);
  });

  it("moves columns onto the new board by position", () => {
    const map = remapStatusLabels(
      ["OPEN", "IN PROGRESS", "PAUSED", "ESCALATED", "RESOLVED"],
      ["Lead", "Contacted", "Proposal", "Negotiation", "Won", "Lost"],
    );
    expect(map.get("OPEN")).toBe("Lead");
    expect(map.get("RESOLVED")).toBe("Won");
    expect(map.get("Lost")).toBeUndefined();
  });
});
